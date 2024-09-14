/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const { GroupRepository } = require("../classes/repositories/repositories");
const { UserRepository } = require("../classes/repositories/repositories");
const { v4: uuid } = require("uuid");

const { 
    UserWithPWARegistered, 
    UserConfirmed,
    GroupMemberJoined,
    GroupCreated,
    GroupKeyRotate
 } = require("../classes/events/events");
 
 module.exports = {
    name: "admin",

    /**
     * Service settings
     */
    settings: {
        /*
        email: "admin@domain.de",
        initialPassword: "ANRC4ZtNmYmpwhzCVAeuRRTX",
        locale: "de"
        */
    },

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    dependencies: [],	
 
    /**
     * Actions
     */
    actions: {},

    /**
     * Events
     */
    events: {

        // forward workflow relevant events with owner admin group
        "UserConfirmationRequested" : { group: "admin", async handler (ctx) { await this.forwardEvent(ctx); } },
        "UserPasswordResetRequested" : { group: "admin", async handler (ctx) { await this.forwardEvent(ctx); } },
        "UserDeletionRequested" : { group: "admin", async handler (ctx) { await this.forwardEvent(ctx); } },
        "UserDeletionConfirmed" : { group: "admin", async handler (ctx) { await this.forwardEvent(ctx); } },
        "GroupCreated" : { group: "admin", async handler (ctx) { await this.forwardEvent(ctx); } },
        "GroupDeletionConfirmed" : { group: "admin", async handler (ctx) { await this.forwardEvent(ctx); } }

    },

    /**
     * Methods
     */
    methods: {

        async forwardEvent (ctx) {
            // forward events with owner admin group
            // - where owner <> admin group id
            // - events with owner = admin group will be processed by the flow module directly
            if (ctx.meta?.ownerId !== this.groupId) {
                ctx.meta = {
                    ...ctx.meta,
                    origin: ctx.meta.ownerId,
                    ownerId: this.groupId,
                    acl: null
                }
                await ctx.emit(ctx.eventName, ctx.params, ["events"]);
            }
        },

        async initAdminGroup () {
            const email = this.admin.email;
            let user, userId;
            if (email) {
                userId = await this.userRepository.preserveUniqueKey({ key: email, uid: uuid() });
                user = await this.userRepository.getById({ uid: userId });
                if (!user.isPersistant()) {
                    const locale = this.admin.locale || "en";
                    const initialPassword = this.admin.initialPassword;
                    if (!initialPassword) throw new Error("Initial password is missing");
    
                    const hashedPassword = this.encryption.getHash(initialPassword);
                    const events = [];
                    // apply command
                    events.push(user.apply(new UserWithPWARegistered({ userId, email, passwordHash: hashedPassword, locale })));
                    events.push(user.apply(new UserConfirmed({ userId })));
                    // persist
                    await user.commit();
                    this.logger.info("New admin user created", { email, userId });
                }
            }

            const groupId = await this.groupRepository.preserveUniqueKey({ key: this.uniqueKey, uid: uuid() });
            const group = await this.groupRepository.getById({ uid: groupId });
            if (!group.isPersistant()) {
                if (!user.isConfirmed()) throw new Error("Admin hasn't been created");
                const events = [];
                // apply command
                events.push(group.apply(new GroupCreated({ groupId, label: this.uniqueKey, admin: true })));
                events.push(group.apply(new GroupMemberJoined({ groupId, label: this.uniqueKey, member: user.getTokenData(), role: "admin" })));
                events.push(group.apply(new GroupKeyRotate({ 
                    groupId, 
                    keyId: uuid(), 
                    key: this.encryption.randomBytes({ length: 32 }),
                    expirationDays: group.getExpirationDays() 
                })));
                // persist
                await group.commit();
                this.logger.info("New admin group created", { uniqueKey: this.uniqueKey, groupId });
            // group exists, but user is no admin
            } else if (!group.isAdmin({ user })) {
                if (!user.isConfirmed()) throw new Error("Admin hasn't been created");
                const events = [];
                // apply command
                events.push(group.apply(new GroupMemberJoined({ groupId, label: this.uniqueKey, member: user.getTokenData(), role: "admin" })));
                // persist
                await group.commit();
                this.logger.info("Admin group joined", { groupId, userId, email });
            };
            return groupId;
        }
    },

    /**
     * Service created lifecycle event handler
     */
    async created() {
        this.uniqueKey = this.settings?.uniqueKey || "authm.admin.group";

        this.admin = {
            email: this.settings.email || process.env.ADMIN_EMAIL,
            initialPassword: this.settings.initialPassword || process.env.ADMIN_INITIALPASSWORD,
            locale: this.settings.locale || process.env.ADMIN_LOCALE || "en"
        }
    },

    /**
     * Service started lifecycle event handler
     */
    async started () {
        if (!this.db) throw new Error("Database provider must be injected first");
        if (!this.encryption) throw new Error("Encryption provider must be injected first");
  
        this.userRepository = new UserRepository({ 
            db: this.db, 
            // -1: new snapshot after each event, 100: new snapshot after 100 events
            snapshotCounter: this.settings?.repository?.snapshotCounter || 100,
            publisher: this.publisher
        })

        this.groupRepository = new GroupRepository({ 
           db: this.db, 
           // -1: new snapshot after each event, 100: new snapshot after 100 events
           snapshotCounter: this.settings?.repository?.snapshotCounter || 100,
           publisher: this.publisher
        })
        await this.db.connect();

        this.groupId = await this.initAdminGroup();
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
        await this.db.disconnect();
    }

}
