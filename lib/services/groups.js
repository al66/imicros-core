/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { 
   GroupCreated, 
   GroupMemberJoined,
   GroupMemberLeft,
   GroupMemberRemoved,
   GroupInvitationRefused,
   GroupRenamed,
   GroupMemberNominatedForAdmin,
   GroupMemberNominationForAdminAccepted,
   GroupMemberNominationForAdminDeclined,
   GroupMemberNominationRemoved,
   GroupAdminRevokationRequested,
   GroupAdminRevokationAccepted,
   GroupAdminRevokationDeclined,
   GroupAdminRevokationRemoved,
   GroupKeyRotate,
   UserInvited,
   UserUninvited,
   AgentCreated,
   AgentRenamed,
   AgentDeleted,
   GroupServiceAccessGranted,
   GroupDeletionRequested,
   GroupDeletionCanceled,
   GroupDeletionConfirmed,
   GroupDeleted
} = require("../events/events");

const { 
   GroupAlreadyExists,
   GroupDoesNotExists,
   LastAdminOfGroup,
   UnvalidToken,
   UserNotYetConfirmed,
   OnlyAllowedForMembers,
   NotAllowedForAdmins,
   RequiresAdminRole,
   GroupHasOtherMembers,
   UserNotInvited,
   UnvalidRequest,
   ServiceAccessNotAllowed,
} = require("../exceptions/exceptions");

const { GroupRepository } = require("../repositories/repositories");
const { Encryption: EncryptionClass } = require("../util/encryption");
const { Constants } = require("../util/constants");
const { v4: uuid } = require("uuid");
const { KafkaJSNumberOfRetriesExceeded } = require("kafkajs");

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

      // ********** Commands ************

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
            events.push(group.apply(new GroupKeyRotate({ 
               groupId: ctx.params.groupId, 
               keyId: uuid(), 
               key: this.encryption.randomBytes({ length: 32 }),
               expirationDays: group.getExpirationDays() 
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
                type: Constants.TOKEN_TYPE_INVITATION, 
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
       * Refuse group invitation
       * 
       * @command
       * @param {String} invitationToken
       * 
       * @emits GroupInvitationRefused
       * 
       * @throws UnvalidToken
       * 
       * @returns {Boolean} accepted
       */
      refuseInvitation: {
         params: {
            invitationToken: { type: "string" }
         },
         async handler(ctx) {
            const events = [];
            // validate command
            const decoded = await this.encryption.verify({ token: ctx.params.invitationToken });
            const group = await this.groupRepository.getById({ uid: decoded.payload.groupId });
            events.push(group.apply(new GroupInvitationRefused({ 
               groupId: decoded.payload.groupId, 
               email: decoded.payload.email
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
            if (group.isLastAdmin({ user })) throw new LastAdminOfGroup({ groupId: ctx.params.groupId }); 
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

      /**
       * Remove member
       * 
       * @command
       * @param {Uuid} groupId
       * @param {Uuid} userId
       * 
       * @emits GroupMemberRemoved
       * 
       * @throws RequiresAdminRole
       * @throws NotAllowedForAdmins
       * @throws OnlyAllowedForMembers
       * 
       * @returns {Boolean} accepted
       */
      removeMember: {
         params: {
            groupId: { type: "uuid"}, 
            userId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            if (!group.isMember({ user: { uid: ctx.params.userId } })) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            if (group.isAdmin({ user: { uid: ctx.params.userId }})) throw new NotAllowedForAdmins({ groupId: ctx.params.groupId, userId: ctx.params.userId});
            events.push(group.apply(new GroupMemberRemoved({ 
               groupId: ctx.params.groupId, 
               userId: ctx.params.userId
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Nominate member for admin
       * 
       * @command
       * @param {Uuid} groupId
       * @param {Uuid} userId
       * 
       * @emits GroupMemberNominatedForAdmin
       * 
       * @throws RequiresAdminRole
       * @throws NotAllowedForAdmins
       * @throws OnlyAllowedForMembers
       * 
       * @returns {Boolean} accepted
       */
      nominateForAdmin: {
         params: {
            groupId: { type: "uuid"}, 
            userId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            const { member } = group.getMember({ user: { uid: ctx.params.userId }});
            if (!member) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            if (member.role === "admin") throw new NotAllowedForAdmins({ groupId: ctx.params.groupId, userId: ctx.params.userId});
            events.push(group.apply(new GroupMemberNominatedForAdmin({ 
               groupId: ctx.params.groupId, 
               member,
               newRole: "admin",
               nominatedBy: user
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Remove nomination
       * 
       * @command
       * @param {Uuid} groupId
       * @param {Uuid} userId
       * 
       * @emits GroupMemberNominationRemoved
       * 
       * @throws RequiresAdminRole
       * @throws UnvalidRequest
       * @throws OnlyAllowedForMembers
       * 
       * @returns {Boolean} accepted
       */
      removeNomination: {
         params: {
            groupId: { type: "uuid"}, 
            userId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            const { member } = group.getMember({ user: { uid: ctx.params.userId }});
            if (!member) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            if (!member.request?.role === "admin") throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: ctx.params.userId, command: "removeNomination" });
            events.push(group.apply(new GroupMemberNominationRemoved({ 
               groupId: ctx.params.groupId, 
               member,
               removedBy: user
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Accept nomination for admin
       * 
       * @command
       * @param {Uuid} groupId
       * 
       * @emits GroupMemberNominationForAdminAccepted
       * 
       * @throws UnvalidRequest
       * 
       * @returns {Boolean} accepted
       */
      acceptNomination: {
         params: {
            groupId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            const { member } = group.getMember({ user });
            if (!member.request.role === "admin") throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: user.uid, command: "acceptNomination" });
            events.push(group.apply(new GroupMemberNominationForAdminAccepted({ 
               groupId: ctx.params.groupId, 
               userId: user.uid
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Decline nomination for admin
       * 
       * @command
       * @param {Uuid} groupId
       * 
       * @emits GroupMemberNominationForAdminDeclined
       * 
       * @throws UnvalidRequest
       * 
       * @returns {Boolean} accepted
       */
      declineNomination: {
         params: {
            groupId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            const { member } = group.getMember({ user });
            if (!member.request.role === "admin") throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: user.uid, command: "acceptNomination" });
            events.push(group.apply(new GroupMemberNominationForAdminDeclined({ 
               groupId: ctx.params.groupId, 
               userId: user.uid
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Request revokation of admin
       * 
       * @command
       * @param {Uuid} groupId
       * @param {Uuid} userId
       * @param {String} newRole
       * 
       * @emits GroupAdminRevokationRequested
       * 
       * @throws UnvalidRequest
       * @throws RequiresAdminRole
       * @throws OnlyAllowedForMembers
       * 
       * @returns {Boolean} accepted
       */
      revokeAdmin: {
         params: {
            groupId: { type: "uuid"}, 
            userId: { type: "uuid"},
            newRole: { type: "string"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            if (ctx.params.newRole === "admin") throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: user.uid, command: "revokeAdmin", newRole: "admin" });
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            const { member } = group.getMember({ user: { uid: ctx.params.userId }});
            if (!member) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            if (member.role !== "admin") throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: user.uid, command: "revokeAdmin" });
            if (member.request?.revoke) {
               // Accept, if after 14 days neither confirmed nor declined
               const d = new Date();
               d.setDate(d.getDate() - 14);
               if (member.request?.at < d) {
                  events.push(group.apply(new GroupAdminRevokationAccepted({ 
                     groupId: ctx.params.groupId, 
                     userId: user.uid
                  })));
               } else {
                  throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: user.uid, command: "revokeAdmin" });
               }
            } else {
               events.push(group.apply(new GroupAdminRevokationRequested({ 
                  groupId: ctx.params.groupId, 
                  member,
                  newRole: ctx.params.newRole,
                  requestedBy: user
               })));
            }
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Remove revokation Request
       * 
       * @command
       * @param {Uuid} groupId
       * @param {Uuid} userId
       * 
       * @emits GroupAdminRevokationRemoved
       * 
       * @throws RequiresAdminRole
       * @throws UnvalidRequest
       * @throws OnlyAllowedForMembers
       * 
       * @returns {Boolean} accepted
       */
      removeRevokationRequest: {
         params: {
            groupId: { type: "uuid"}, 
            userId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            const { member } = group.getMember({ user: { uid: ctx.params.userId }});
            if (!member) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            if (!member.request?.revoke) throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: ctx.params.userId, command: "removeRevokationRequest" });
            events.push(group.apply(new GroupAdminRevokationRemoved({ 
               groupId: ctx.params.groupId, 
               member,
               removedBy: user
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Accept revokation
       * 
       * @command
       * @param {Uuid} groupId
       * 
       * @emits GroupAdminRevokationAccepted
       * 
       * @throws UnvalidRequest
       * 
       * @returns {Boolean} accepted
       */
      acceptRevokation: {
         params: {
            groupId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            const { member } = group.getMember({ user });
            if (!member.request.revoke === true) throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: user.uid, command: "acceptRevokation" });
            events.push(group.apply(new GroupAdminRevokationAccepted({ 
               groupId: ctx.params.groupId, 
               userId: user.uid
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Decline revokation
       * 
       * @command
       * @param {Uuid} groupId
       * 
       * @emits GroupAdminRevokationDeclined
       * 
       * @throws UnvalidRequest
       * 
       * @returns {Boolean} accepted
       */
      declineRevokation: {
         params: {
            requestToken: { type: "string"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            const { member } = group.getMember({ user });
            if (!member.request.revoke === true) throw new UnvalidRequest({ groupId: ctx.params.groupId, userId: user.uid, command: "acceptRevokation" });
            events.push(group.apply(new GroupAdminRevokationDeclined({ 
               groupId: ctx.params.groupId, 
               userId: user.uid
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /** 
       * Grant access for service
       * 
       * @command
       * @param {Uuid} groupId
       * @param {String} service
       * 
       * @emits GroupServiceAccessGranted
       * 
       * @throws UnvalidRequest
       * @throws RequiresAdminRole
       * 
       * @returns {Boolean} accepted
       */
      grantServiceAccess: {
         visibility: "public",
         params: {
            groupId: { type: "uuid"},
            service: { type: "string"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const regex = new RegExp(`^(v[[:digit:]]+\.)?${ ctx.params.service }\.[[:alnum:]]+$`,"i");
            if (!ctx.caller.match(regex)) throw new UnvalidRequest({ groupId: ctx.params.groupId, service: ctx.caller, command: "grantServiceAccess"});
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            events.push(group.apply(new GroupServiceAccessGranted({
               groupId: ctx.params.groupId,
               service: ctx.params.service,
               grantedBy: user.uid
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Request deletion of a group
       * 
       * @command
       * @param {Uuid} groupId
       * 
       * @emits GroupDeletionRequested
       * 
       * @throws RequiresAdminRole
       * @throws GroupHasOtherMembers
       * @throws UnvalidRequest
       * 
       * @returns {Boolean} accepted
       */
      requestDeletion: {
         params: {
            groupId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            if (group.hasMembers()) throw new GroupHasOtherMembers({ groupId: ctx.params.groupId }); 
            if (group.isDeletionInProgress()) throw new UnvalidRequest({ groupId: ctx.params.groupId, command: "requestDeletion" });
            events.push(group.apply(new GroupDeletionRequested({ 
               groupId: ctx.params.groupId, 
               requestedBy: user
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Cancel deletion request
       * 
       * @command
       * @param {Uuid} groupId
       * 
       * @emits GroupDeletionCanceled
       * 
       * @throws RequiresAdminRole
       * @throws UnvalidRequest
       * 
       * @returns {Boolean} accepted
       */
      cancelDeletionRequest: {
         params: {
            groupId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            if (group.isDeletionInProgress()) throw new UnvalidRequest({ groupId: ctx.params.groupId, command: "requestDeletion" });
            if (!group.isDeletionRequested()) throw new UnvalidRequest({ groupId: ctx.params.groupId, command: "requestDeletion" });
            events.push(group.apply(new GroupDeletionCanceled({ 
               groupId: ctx.params.groupId, 
               canceledBy: user
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Confirm deletion request
       * 
       * @command
       * @param {Uuid} groupId
       * 
       * @emits GroupDeletionConfirmed
       * 
       * @throws RequiresAdminRole
       * @throws UnvalidRequest
       * 
       * @returns {Boolean} accepted
       */
      confirmDeletion: {
         params: {
            groupId: { type: "uuid"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAdmin({ user })) throw new RequiresAdminRole({ groupId: ctx.params.groupId });
            if (!group.isDeletionRequested()) throw new UnvalidRequest({ groupId: ctx.params.groupId, command: "confirmDeletion" });
            const deletionToken = await this.encryption.sign({ 
               payload: { 
                   type: Constants.TOKEN_TYPE_GROUP_DELETION, 
                   groupId: ctx.params.groupId, 
                   confirmedBy: user, 
                   confirmedAt: new Date().getTime()
               }, options: {}
            });
            events.push(group.apply(new GroupDeletionConfirmed({ 
               groupId: ctx.params.groupId, 
               deletionToken: deletionToken.token,
               confirmedBy: user
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      /**
       * Delete group
       * 
       * @command
       * @param {String} deletionToken
       * 
       * @emits GroupDeleted
       * 
       * @throws UnvalidRequest
       * 
       * @returns {Boolean} accepted
       */
      delete: {
         params: {
            deletionToken: { type: "string"}
         },
         async handler (ctx) {
            const events = [];
            // validate command
            const decoded = await this.encryption.verify({ token: ctx.params.deletionToken });
            if (decoded.payload?.type !== Constants.TOKEN_TYPE_GROUP_DELETION) throw new UnvalidRequest({ deletionToken: ctx.params.deletionToken, command: "delete" });
            const group = await this.groupRepository.getById({ uid: decoded.payload?.groupId });
            events.push(group.apply(new GroupDeleted({ 
               groupId: decoded.payload.groupId, 
               deletionToken: ctx.params.deletionToken,
               lastAdmin: decoded.payload.confirmedBy
            })));
            // persist
            await group.commit();
            // return result
            return true;
         }
      },

      // ********** Queries ************

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
            const { user, decoded } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isMember({ user })) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            const { token: accessToken } = await this.encryption.sign({ payload: { 
               type: Constants.TOKEN_TYPE_GROUP_ACCESS, 
               groupId: ctx.params.groupId, 
               userId: user.uid,
               sessionId: decoded.sessionId,
               adminGroup: group.isAdminGroup()
            }});
            // return result
            return { accessToken };
         }
      },

      /**
      * Request group acccess for agent
      * 
      * @query
      * @param {String} groupId 
      * 
      * @returns {Object} accessToken
      */
      requestAccessForAgent: {
         params: {
            groupId: { type: "uuid" }
         },
         async handler (ctx) {
            // validate query
            const { agent, decoded } = await this.getAgent(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isAgent({ agent })) throw new UnvalidRequest({ groupId: ctx.params.groupId, agentId: agent.uid, query: "requestAccessForAgent" });
            const { token: accessToken } = await this.encryption.sign({ payload: { 
               type: Constants.TOKEN_TYPE_GROUP_ACCESS, 
               groupId: ctx.params.groupId, 
               agentId: agent.uid,
               sessionId: decoded.sessionId,
               adminGroup: group.isAdminGroup()
            }});
            // return result
            return { accessToken };
         }
      },

      /**
       * Request group acccess for service
       * 
       * @query
       * @param {String} groupId
       * @param {String} service
       * 
       * @throws UnvalidRequest
       * @throws GroupDoesNotExists
       * @throws ServiceAccessNotAllowed
       * 
       * @returns {Object} accessToken
       */
      requestAccessForService: {
         visibility: "public",
         params: {
            groupId: { type: "uuid" },
            service: { type: "string" }
         },
         async handler (ctx) {
            // validate query
            const regex = new RegExp(`^(v[[:digit:]]+\.)?${ ctx.params.service }\.[[:alnum:]]+$`,"i");
            if (!ctx.caller.match(regex)) throw new UnvalidRequest({ groupId: ctx.params.groupId, service: ctx.caller, query: "requestAccessForService"});
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: ctx.params.groupId });
            if (!group.isServiceAccessAllowed({ service: ctx.params.service })) throw new ServiceAccessNotAllowed({ groupId: ctx.params.groupId, service: ctx.params.service });
            const { token: accessToken } = await this.encryption.sign({ payload: { 
               type: Constants.TOKEN_TYPE_GROUP_ACCESS, 
               groupId: ctx.params.groupId, 
               service: ctx.params.service,
               adminGroup: group.isAdminGroup()
            }});
            // return result
            return { accessToken };
         }
      },

      /**
      * Called by acl middleware: Check authorization
      * 
      * @query 
      * @param {Object}    action      action object
      * @param {Object}    ctx         context object
      * @param {Any}       result      result of the request (optional)
      * @param {Boolean}   abort       abort request if not authorized (optional, default: true) 
      * 
      * @throws UnvalidToken
      *
      * @returns {Boolean} true | false
      */
      isAuthorized: {
         visibility: "public",
         params: {
            action: { type: "object" },
            ctx: { type: "object" }, 
            result: { type: "any", optional: true }, 
            abort: { type: "boolean", optional: true, default: true }
         },
         async handler (ctx) {
            if (!ctx.meta?.accessToken) {
               if (ctx.params.abort === true) throw new UnvalidToken({ token: "not provided" });
               return false;
            }
            try {
               const decoded = await this.encryption.verify({ token: ctx.meta.accessToken });
               if (decoded.payload?.type === Constants.TOKEN_TYPE_GROUP_ACCESS) {
                  if (action.acl?.onlyAdminGroup === true && !decoded.payload.adminGroup) {
                     if (ctx.params.abort === true) throw new UnvalidToken({ token: ctx.meta.accessToken });
                     return false;      
                  }
                  ctx.meta.acl = {
                     nodeID: this.broker.nodeID,
                     ownerId: decoded.payload.groupId,
                     userId: decoded.payload.userId || null,
                     agentId: decoded.payload.agentId || null,
                     service: decoded.payload.service || null,
                     unrestricted: true
                  }
                  return true;
               }
            } catch (err) {
               if (ctx.params.abort === true) throw new UnvalidToken({ token: ctx.meta.accessToken });
               return false;
            }

            // final error
            if (ctx.params.abort === true) throw new UnvalidToken({ token: ctx.meta.accessToken });
            return false;
         }
      },

      /**
       * Encrypt data with group key
       * 
       * @command
       * @param {Object} data
       * 
       * @throws GroupDoesNotExists
       * 
       * @returns {String} encrypted data
       */
      encrypt: {
         params: {
            data: { type: "object" }
         },
         async handler (ctx) {
            const { payload: access } = await this.encryption.verify({ token: ctx.meta.accessToken });
            const group = await this.groupRepository.getById({ uid: access.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: access.groupId });
            const keyProvider = this.buildKeyProvider({ keys: group.getKeys(), owner: group.getId(), service: this.getServiceName(ctx) });
            const def = keyProvider.getKey();
            if (def.exp > Date.now()) {
               this.broker.emit("GroupsDefaultKeyExpired", { groupId: group.getId() });
            }
            const encryption = new EncryptionClass({ 
               logger: this.broker.logger,
               keys: keyProvider,
               serializer: this.serializer, 
               options: {} 
           })
           const encoded = await encryption.encryptData(ctx.params.data);
           return encoded;
            // 
         }
      },

      /**
       * decrypt data with group key
       * 
       * @command
       * @param {String} encrypted data
       * 
       * @throws GroupDoesNotExists
       * 
       * @returns {Any} decrypted data
       */
      decrypt: {
         params: {
            encrypted: { type: "string" }
         },
         async handler (ctx) {
            const { payload: access } = await this.encryption.verify({ token: ctx.meta.accessToken });
            const group = await this.groupRepository.getById({ uid: access.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: access.groupId });
            const keyProvider = this.buildKeyProvider({ keys: group.getKeys(), owner: group.getId(), service: this.getServiceName(ctx) });
            // 
            const encryption = new EncryptionClass({ 
               logger: this.broker.logger,
               keys: keyProvider,
               serializer: this.serializer, 
               options: {} 
           })
           const decoded = await encryption.decryptData(ctx.params.encrypted);
           return decoded;
         }
      },

      encryptStream: {
         async handler (ctx) {
            const { payload: access } = await this.encryption.verify({ token: ctx.meta.accessToken });
            const group = await this.groupRepository.getById({ uid: access.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: access.groupId });
            const keyProvider = this.buildKeyProvider({ keys: group.getKeys(), owner: group.getId(), service: this.getServiceName(ctx) });
            // 
            const encryption = new EncryptionClass({ 
               logger: this.broker.logger,
               keys: keyProvider,
               serializer: this.serializer, 
               options: {} 
           })
           return encryption.encryptStream(access.groupId);
         }
      },

      decryptStream: {
         async handler (ctx) {
            const { payload: access } = await this.encryption.verify({ token: ctx.meta.accessToken });
            const group = await this.groupRepository.getById({ uid: access.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: access.groupId });
            const keyProvider = this.buildKeyProvider({ keys: group.getKeys(), owner: group.getId(), service: this.getServiceName(ctx) });
            // 
            const encryption = new EncryptionClass({ 
               logger: this.broker.logger,
               keys: keyProvider,
               serializer: this.serializer, 
               options: {} 
           })
           return encryption.decryptStream(access.groupId);
         }
      },

      /**
      * verify access token & add internal access token to meta data 
      * 
      * @query
      * 
      * @returns {Object} accessToken
      */
       verifyAccessToken: {
         async handler (ctx) {
            // validate query
            delete ctx.meta.accessToken;
            if (!ctx.meta?.authToken) return false;
            try {
               const decoded = await this.encryption.verify({ token: ctx.meta.authToken });
               const group = await this.groupRepository.getById({ uid: decoded.payload.groupId });
               if (decoded.payload.type !== Constants.TOKEN_TYPE_GROUP_ACCESS) return false;
               const { user } = ctx.meta?.userToken ? await this.getUser(ctx) : {};
               const { agent } = ctx.meta?.agentToken ? await this.getAgent(ctx) : {};
               const { member } = user.uid && group.isMember({ user })? group.getMember({ user }) : {};
               const { token: accessToken } = await this.encryption.sign({ payload: { 
                  type: Constants.TOKEN_TYPE_ACCESS_INTERNAL, 
                  nodeID: ctx.broker.nodeID,
                  groupId: group.uid, 
                  userId: user?.uid || null,
                  agentId: agent?.uid || null,
                  user: user?.uid ? user : null,
                  agent: agent?.uid ? agent : null,
                  role: member?.role || null
               }});
               ctx.meta.accessToken = accessToken;
               // return result
               return accessToken;
            } catch (error) {
               this.logger.error("unvalid accessToken", error);
               return false;
            }
         }
      }, 

      /**
      * Get event log 
      * 
      * @query
      * @param {Date} from 
      * @param {Date} to 
      * 
      * @returns {Object} log data
      */
      getLog: {
         params: {
            groupId: { type: "uuid" },
            from: { type: "date", convert: true, optional: true },
            to: { type: "date", convert: true, optional: true }
         },
         async handler (ctx) {
            // validate query
            const { user } = await this.getUser(ctx);
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            if (!group.isPersistant()) throw new GroupDoesNotExists({ uid: ctx.params.groupId });
            if (!group.isMember({ user })) throw new OnlyAllowedForMembers({ groupId: ctx.params.groupId });
            const log = await this.groupRepository.getLog({ uid: group.uid, from: ctx.params.from, to: ctx.params.to });
            // return result
            return log;
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
      },
      GroupsDefaultKeyExpired: {
         params: {
            groupId: { type: "uuid" }
        },
        async handler(ctx) {
            const group = await this.groupRepository.getById({ uid: ctx.params.groupId });
            // apply command
            group.apply(new GroupKeyRotate({ 
               groupId: ctx.params.groupId, 
               keyId: uuid(), 
               key: this.encryption.randomBytes({ length: 32 }),
               expirationDays: group.getExpirationDays() 
            }));
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
         return { user: decoded.payload.user, decoded }; 
      },

      async getAgent(ctx) {
         const agentToken = ctx.meta?.agentToken;
         const decoded = await this.encryption.verify({ token: agentToken });
         return { agent: decoded.payload.agent, decoded }; 
      },

      getServiceName(ctx) {
         const serviceName = (ctx.meta.caller).match(/\.[0-9a-zA-Z_-]+$/i);
         if (!serviceName) throw new UnvalidRequest({ caller: ctx.meta.caller });
         return serviceName;
      },

      buildKeyProvider({ keys, owner, service }) {
         return {
            getKey: async ({ id = null } = {}) => {
               //console.log("Keys called", { id, keys});
               let key = {};
               // return requested key
               if (id && keys.store[id]) {
                  key.id = id;
                  key.key = keys.store[id].key;
               } else {
                  key.id = keys.default;
                  key.key = keys.store[keys.default].key,
                  key.exp = keys.store[keys.default].exp
               };
               key.key = await this.vault.hash(key.key, owner+service);
               return key;
            }
         }
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
      if (!this.vault) throw new Error("Vault provider must be injected first");

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