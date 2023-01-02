/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { 
   GroupCreated, 
   GroupMemberJoined,
   GroupMemberLeft,
   GroupRenamed,
   UserInvited,
   UserUninvited,
   AgentCreated,
   AgentRenamed,
   AgentDeleted
} = require("../events/events");

const { 
   GroupAlreadyExists,
   GroupDoesNotExists,
   UnvalidToken,
   UserNotYetConfirmed,
   OnlyAllowedForMembers,
   RequiresAdminRole,
   UserNotInvited
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
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (group.isPersistant()) throw new GroupAlreadyExists({ uid: ctx.params.groupId });
            // apply command
            events.push(group.apply(new GroupCreated({ groupId: ctx.params.groupId, label: ctx.params.label })));
            events.push(group.apply(new GroupMemberJoined({ groupId: ctx.params.groupId, label: ctx.params.label, member: user, role: "admin" })));
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
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            // apply command
            events.push(group.apply(new GroupRenamed({ user, groupId: ctx.params.groupId, label: ctx.params.label })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Invite user
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
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            const invitationTokenSigned = await this.encryption.sign({ payload: { 
                type: "invitationToken", 
                groupId: ctx.params.groupId, 
                email: ctx.params.email,
                role: "member",
                invitedBy: {
                    uid: user.uid,
                    email: user.email
                }
            }});
            // apply command
            events.push(group.apply(new UserInvited({ 
                groupId: ctx.params.groupId, 
                label: group.getLabel(), 
                email: ctx.params.email, 
                invitationToken: invitationTokenSigned.token, 
                invitedBy: {
                  uid: user.uid,
                  email: user.email
                }
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Uninvite user
       * 
       * @command
       * @param {Uuid} groupId
       * @param {Email} email 
       * 
       * @emits Useruninvited
       * 
       * @throws RequiresAdminRole
       * 
       * @returns {Boolean} accepted
       */
       uninviteUser: {
         params: {
            groupId: { type: "uuid" },
            email: { type: "email" }
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            if (!group.isInvited({ email: ctx.params.email })) throw new UserNotInvited({ groupId: ctx.params.groupId, email: ctx.params.email })
            // apply command
            events.push(group.apply(new UserUninvited({ 
                groupId: ctx.params.groupId, 
                email: ctx.params.email, 
                uninvitedBy: {
                  uid: user.uid,
                  email: user.email
                }
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },


      /**
       * Join group
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
            const { user } = await this.getUser(ctx);
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
       * Leave group
       * 
       * @command
       * @param {Uuid} groupId
       * 
       * @emits GroupMemberLeft
       * 
       * @throws OnlyAllowedForMembers
       * 
       * @returns {Boolean} accepted
       */
      leave: {
         params: {
            groupId: { type: "uuid" }
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isMember({ user })) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            events.push(group.apply(new GroupMemberLeft({ 
               groupId: ctx.params.groupId, 
               member: user
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      // TODO
      refuseInvitation: {
         params: {
            invitationToken: { type: "string"}
         },
         async handler (ctx) {

         }
      },

      // TODO
      removeMember: {
         params: {
            groupId: { type: "uuid"}, 
            userId: { type: "uuid"}
         },
         async handler (ctx) {

         }
      },

      // TODO
      nominateAdmin: {
         params: {
            groupId: { type: "uuid"}, 
            userId: { type: "uuid"}
         },
         async handler (ctx) {

         }
      },

      // TODO
      revokeAdmin: {
         params: {
            groupId: { type: "uuid"}, 
            userId: { type: "uuid"}
         },
         async handler (ctx) {

         }
      },

      // TODO
      acceptNomination: {
         params: {
            requestToken: { type: "string"}
         },
         async handler (ctx) {
            // check also authToken

         }
      },

      // TODO
      acceptRevokation: {
         params: {
            requestToken: { type: "string"}
         },
         async handler (ctx) {
            // check also authToken

         }
      },

      // TODO
      declineNomination: {
         params: {
            requestToken: { type: "string"}
         },
         async handler (ctx) {
            // check also authToken
         }
      },

      // TODO
      declineRevokation: {
         params: {
            requestToken: { type: "string"}
         },
         async handler (ctx) {
            // check also authToken
         }
      },

      // TODO
      requestDeletion: {
         params: {
            groupId: { type: "uuid"}
         },
         async handler (ctx) {

         }
      },

      // TODO
      delete: {
         params: {
            deletionToken: { type: "string"}
         },
         async handler (ctx) {

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
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: ctx.params.groupId });
            if (!group.isMember({ user })) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            // return result
            return group.getCurrentState();
         }
      },

      /**
      * Request group acccess for member
      * 
      * @query
      * @param {String} groupId 
      * 
      * @returns {Object} accessToken
      */
      requestAccessForMember: {
         params: {
            groupId: { type: "uuid" }
         },
         async handler (ctx) {
            // validate query
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isMember({ user })) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            const { token: accessToken } = await this.encryption.sign({ payload: { 
               type: "accessToken", 
               groupId: ctx.params.groupId, 
               userId: user.uid
            }});
            // return result
            return { accessToken };
         }
      },

      /**
      * verify access token & add acl token to meta data 
      * 
      * @query
      * 
      * @returns {Object} aclToken
      */
       verifyAccessToken: {
         async handler (ctx) {
            // validate query
            delete ctx.meta.acl;
            if (!ctx.meta?.accessToken) return false;
            const decoded = await this.encryption.verify({ token: ctx.meta.accessToken });
            if (decoded.payload?.userId) {
               const { user } = await this.getUser(ctx);
               if (decoded.payload.userId === user.uid) {
                  const group = await this.groupRepository.getById({ uid: decoded.payload.groupId });
                  if (group.isMember({ user })) {
                     const { member } = group.getMember({ user });
                     const { token: aclToken } = await this.encryption.sign({ payload: { 
                        type: "aclToken", 
                        groupId: group.uid, 
                        userId: member.user.uid,
                        role: member.role,
                        unrestricted: true
                     }});
                     
                     ctx.meta.acl = {
                        nodeID: ctx.broker.nodeID,
                        token: aclToken, 
                        groupId: group.uid, 
                        userId: member.user.uid,
                        role: member.role,
                        unrestricted: true
                     }
                     // return result
                     return { aclToken };
                  }
               }
            }
            delete ctx.meta.accessToken;
            throw new UnvalidToken({ token: ctx.meta.accessToken });;
         }
      }

   },
     
   /**
    * Events
    */
   events: {

      AgentCreated: {
         params: {
            groupId: { type: "uuid" },
            agentId: { type: "uuid" },
            label: { type: "string" },
            createdAt: { type: "number" }
        },
        async handler(ctx) {
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            // apply command
            group.apply(new AgentCreated({ ...ctx.params })); 
            // persist
            await group.commit({ emit: false });
        }
      },
      AgentRenamed: {
         params: {
            groupId: { type: "uuid" },
            agentId: { type: "uuid" },
            label: { type: "string" }
        },
        async handler(ctx) {
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            // apply command
            group.apply(new AgentRenamed({ ...ctx.params })); 
            // persist
            await group.commit({ emit: false });
        }
      },
      AgentDeleted: {
         params: {
            groupId: { type: "uuid" },
            agentId: { type: "uuid" }
        },
        async handler(ctx) {
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            // apply command
            group.apply(new AgentDeleted({ ...ctx.params })); 
            // persist
            await group.commit({ emit: false });
        }
      }

   },

   /**
    * Methods
    */
   methods: {

      async getUser(ctx) {
         const userToken = ctx.meta?.userToken;
         const decoded = await this.encryption.verify({ token: userToken });
         if(!decoded.payload.user.confirmedAt) throw new UserNotYetConfirmed({ uid: decoded.payload.userId });
         return { user: decoded.payload.user }; 
      }

   },

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