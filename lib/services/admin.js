/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const { GroupRepository } = require("../repositories/repositories");
const { UserRepository } = require("../repositories/repositories");
const { v4: uuid } = require("uuid");

const { 
    UserWithPWARegistered, 
    UserConfirmed,
    GroupMemberJoined,
    GroupCreated
 } = require("../events/events");
 
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
        events: [
            "UserConfirmationRequested"
            "UserPasswordResetRequested"
            "UserDeletionRequested"
            "UserDeletionConfirmed"
            "GroupCreated"
            "GroupDeletionConfirmed"
        ],
        channel: "imicros.admin.events",
        adapter: "Kafka"
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

        async "**" (payload, sender, event, ctx) {
            // push events according to the settings
            // - where owner <> admin group id
            // - events with owner = admin group will be processed by the flow module directly
            if (this.events.indexOf(event) >= 0 && ctx.meta?.owner !== this.groupId) {
                const headers = {
                    event,
                    sender,
                    // Kafka key for partition determination
                    key: this.groupId,
                }
                await this.broker.sendToChannel(this.channel, {
                    event,
                    sender,
                    owner: this.groupId,
                    origin: ctx.meta.owner,
                    payload
                }, {
                    headers
                })
            }
        }
    },

    /**
     * Methods
     */
    methods: {
        async initAdminGroup () {
            const email = this.settings.email;
            let user, userId;
            if (email) {
                userId = await this.userRepository.preserveUniqueKey({ key: email, uid: uuid() });
                user = await this.userRepository.getById({ uid: userId });
                if (!user.isPersistant()) {
                    const locale = this.settings.locale || "en";
                    const initialPassword = this.settings.initialPassword;
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
        this.uniqueKey = "authm.admin.group";
        this.events = this.settings?.events || [];
        this.channel = this.settings?.channel || "imicros.internal.events";
        this.adapter = this.settings?.adapter || "Kafka";

        // Validate channel name for Kafka
        if(this.adapter === "Kafka" && !this.channel.match(/[a-zA-Z0-9\\._\\-]/)) throw new Error("Invalid channel name - must match [a-zA-Z0-9\\._\\-]",{ channel: this.channel } );

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
