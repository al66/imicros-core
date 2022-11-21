/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { 
   GroupCreated, 
   GroupMemberJoined,
   GroupRenamed,
   UserInvited
} = require("../events/events");

const { 
   GroupAlreadyExists,
   GroupDoesNotExists,
   UnvalidToken,
   UserNotYetConfirmed,
   OnlyAllowedForMembers,
   RequiresAdminRole
} = require("../exceptions/exceptions");

const { GroupRepository } = require("../repositories/repositories");

module.exports = {
   name: "groups",

    /**
     * Service settings
     */
   settings: {},

   /**
    * Service metadata
    */
   metadata: {},

   /**
    * Service dependencies
    */
   //dependencies: [],	
 
   /**
    * Actions
    */
   actions: {

      /**
       * Create a new group
       * 
       * @command
       * @param {Uuid} groupId
       * @param {String} label 
       * 
       * @emits GroupCreated
       * @emits GroupMemberJoined - creating user joined automtically as admin
       * 
       * @throws UserNotYetConfirmed
       * @throws GroupAlreadyExists
       * 
       * @returns {Boolean} accepted
       */
      create: {
         params: {
            groupId: { type: "uuid" },
            label: { type: "string" }
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const decoded = await this.encryption.verify({ token: ctx.meta?.userToken });
            if(!decoded.payload.user.confirmedAt) throw new UserNotYetConfirmed({ uid: decoded.payload.userId });
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (group.isPersistant()) throw new GroupAlreadyExists({ uid: ctx.params.groupId });
            // apply command
            events.push(group.apply(new GroupCreated({ groupId: ctx.params.groupId, label: ctx.params.label })));
            events.push(group.apply(new GroupMemberJoined({ groupId: ctx.params.groupId, label: ctx.params.label, member: decoded.payload.user, role: "admin" })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Rename group
       * 
       * @command
       * @param {Uuid} groupId
       * @param {String} label 
       * 
       * @emits GroupRenamed
       * 
       * @throws GroupDoesNotExists
       * @throws RequiresAdminRole
       * 
       * @returns {Boolean} accepted
       */
      rename: {
         params: {
            groupId: { type: "uuid" },
            label: { type: "string" }
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const decoded = await this.encryption.verify({ token: ctx.meta?.userToken });
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user: decoded.payload.user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            // apply command
            events.push(group.apply(new GroupRenamed({ user: decoded.payload.user, groupId: ctx.params.groupId, label: ctx.params.label })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Rename group
       * 
       * @command
       * @param {Uuid} groupId
       * @param {Email} email 
       * 
       * @emits UserInvited
       * 
       * @throws RequiresAdminRole
       * 
       * @returns {Boolean} accepted
       */
      inviteUser: {
         params: {
            groupId: { type: "uuid" },
            email: { type: "email" }
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const decoded = await this.encryption.verify({ token: ctx.meta?.userToken });
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user: decoded.payload.user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            const invitationTokenSigned = await this.encryption.sign({ payload: { 
                type: "invitationToken", 
                groupId: ctx.params.groupId, 
                email: ctx.params.email,
                role: "member",
                invitedBy: {
                    uid: decoded.payload.user.uid,
                    email: decoded.payload.user.email
                }
            }});
            // apply command
            events.push(group.apply(new UserInvited({ 
                groupId: ctx.params.groupId, 
                label: group.getLabel(), 
                email: ctx.params.email, 
                invitationToken: invitationTokenSigned.token, 
                invitedBy: {
                  uid: decoded.payload.user.uid,
                  email: decoded.payload.user.email
                }
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Rename group
       * 
       * @command
       * @param {String} invitationToken
       * 
       * @emits GroupMemberJoined
       * 
       * @throws UserNotYetConfirmed
       * @throws UnvalidToken
       * 
       * @returns {Boolean} accepted
       */
       join: {
         params: {
            invitationToken: { type: "string" }
         },
         async handler(ctx) {
            const events = [];
            // validate command
            const { payload: { user }} = await this.encryption.verify({ token: ctx.meta?.userToken });
            if (!user.confirmedAt) throw new UserNotYetConfirmed({ uid: user.uid });
            const decoded = await this.encryption.verify({ token: ctx.params.invitationToken });
            const group = await this.groupRepository.getById({ uid: decoded.payload.groupId });
            if (!group.isInvited({ email: decoded.payload.email })) throw new UnvalidToken({ token: ctx.params.invitationToken });
            events.push(group.apply(new GroupMemberJoined({ 
               groupId: decoded.payload.groupId, 
               label: group.getLabel(), 
               member: user,  
               role: decoded.payload.role
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
      * Get group details
      * 
      * @query
      * @param {String} userToken
      * @param {String} groupId 
      * 
      * @returns {Object} group details
      */
      get: {
         params: {
            groupId: { type: "uuid" }
         },
         async handler (ctx) {
            // validate query
            const decoded = await this.encryption.verify({ token: ctx.meta?.userToken });
            if(!decoded.payload.user.confirmedAt) throw new UserNotYetConfirmed({ uid: decoded.payload.userId });
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: ctx.params.groupId });
            if (!group.isMember({ user: decoded.payload.user })) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            // return result
            return group.getCurrentState();
         }
      }

   },
     
   /**
    * Events
    */
   events: {},

   /**
    * Methods
    */
   methods: {},

   /**
    * Service created lifecycle event handler
    */
   async created() {
   },

   /**
    * Service started lifecycle event handler
    */
   async started () {

      if (!this.db) throw new Error("Database provider must be injected first");
      if (!this.encryption) throw new Error("Encryption provider must be injected first");

      this.groupRepository = new GroupRepository({ 
         db: this.db, 
         // -1: new snapshot after each event, 100: new snapshot after 100 events
         snapshotCounter: this.settings?.repository?.snapshotCounter || 100,
         publisher: this.publisher
      })
      await this.db.connect();
   },

   /**
    * Service stopped lifecycle event handler
    */
   async stopped() {
      await this.db.disconnect();
   }
  
}