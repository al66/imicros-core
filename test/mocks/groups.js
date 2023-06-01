"use strict";

const { Encryption: EncryptionClass } = require("../../lib/util/encryption");
const { Serializer: Base } = require("../../lib/util/serializer");
const { v4: uuid } = require("uuid");
const jwt 	= require("jsonwebtoken");

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
 } = require("../../lib/events/events");
 
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
 } = require("../../lib/exceptions/exceptions");
 

const defaultKey = uuid();
const keys = {
    default: defaultKey,
    store: {
        [defaultKey]: {
            key: defaultKey,
            exp: Date.now() + 1000 * 60 * 60 * 24 * 365
        }
    }
}

const Groups = {
    name: "groups",
    version: 1,

    actions: {
        encrypt: {
            params: {
               data: { type: "object" }
            },
            async handler (ctx) {
               const { decoded: access } = await this.getAccess(ctx);
               const groupId = access?.groupId || ctx.meta?.acl?.ownerId;
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: this.getServiceName(ctx) });
               const def = keyProvider.getKey();
               if (def.exp > Date.now()) {
                  this.broker.emit("GroupsDefaultKeyExpired", { groupId });
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
   
         decrypt: {
            params: {
               encrypted: { type: "string" }
            },
            async handler (ctx) {
               const { decoded: access } = await this.getAccess(ctx);
               const groupId = access?.groupId || ctx.meta?.acl?.ownerId;
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: this.getServiceName(ctx) });
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
               const { decoded: access } = await this.getAccess(ctx);
               const groupId = access?.groupId || ctx.meta?.acl?.ownerId;
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: this.getServiceName(ctx) });
               // 
               const encryption = new EncryptionClass({ 
                  logger: this.broker.logger,
                  keys: keyProvider,
                  serializer: this.serializer, 
                  options: {} 
              })
              return encryption.encryptStream(groupId);
            }
         },
   
         decryptStream: {
            async handler (ctx) {
               const { decoded: access } = await this.getAccess(ctx);
               const groupId = access?.groupId || ctx.meta?.acl?.ownerId;
               const keyProvider = this.buildKeyProvider({ keys , owner: groupId, service: this.getServiceName(ctx) });
               // 
               const encryption = new EncryptionClass({ 
                  logger: this.broker.logger,
                  keys: keyProvider,
                  serializer: this.serializer, 
                  options: {} 
              })
              return encryption.decryptStream(groupId);
            }
         },

         encryptValues: {
            params: {
               data: { type: "object" }
            },
            async handler (ctx) {
               const { decoded: access } = await this.getAccess(ctx);
               const groupId = access?.groupId || ctx.meta?.acl?.ownerId;
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: this.getServiceName(ctx) });
               //
               const encryption = new EncryptionClass({
                  logger: this.broker.logger,
                  keys: keyProvider,
                  serializer: this.serializer,
                  options: {}
               })
               const mappedObj = await this.mapDeep(ctx.params.data, async (obj) => encryption.encryptData(obj));
               return mappedObj;
            }
         },
   
         decryptValues: {
            params: {
               data: { type: "object" }
            },
            async handler (ctx) {
               this.logger.info("call decryptValues", ctx.params.data);
               const { decoded: access } = await this.getAccess(ctx);
               const groupId = access?.groupId || ctx.meta?.acl?.ownerId;
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: this.getServiceName(ctx) });
               //
               const encryption = new EncryptionClass({
                  logger: this.broker.logger,
                  keys: keyProvider,
                  serializer: this.serializer,
                  options: {}
               })
               const mappedObj = await this.mapDeep(ctx.params.data, async (obj) => encryption.decryptData(obj));
               this.logger.info("decryptValues", mappedObj);
               return mappedObj;
            }
         }         
            
    },

    methods: {

        async getAccess(ctx) {
            const decoded = await jwt.decode({ token: ctx.meta?.accessToken });
            return { decoded }; 
        },
   
        getServiceName(ctx) {
            const match = (ctx.caller || "!").match(/(?:\.?)(?<servicename>[0-9a-zA-Z_-]+$)/i);
            if (!match?.groups?.servicename ) {
               // console.log("getServiceName - UnvalidRequest", { caller: ctx.caller, match });
               this.logger.error("UnvalidRequest", { caller: ctx.caller, match });
               throw new UnvalidRequest({ caller: ctx.caller });
            }
            const serviceName = match.groups.servicename;
            //console.log("getServiceName", { match, caller: ctx.caller, serviceName });
            return serviceName;
        },
   
        buildKeyProvider({ keys, owner, service }) {
            return {
               getKey: async ({ id = null } = {}) => {
                  // console.log("Keys called", { id, keys});
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
                  return key;
               }
            }
        },

        async mapObj(obj,fn) {
           const self = this;
           if (obj._encrypted) return await fn(obj._encrypted);
           if (obj._encrypt) return {
               "_encrypted": await fn(obj._encrypt)
           };
           // convert obj to array for async mapping
           const mapped = await Promise.all(Object.entries(obj).map(async e => {
               e[1] = await self.mapDeep(e[1], fn);
               return e;
           }));
           // convert array back to obj
           return mapped.reduce((acc, e) => {
               acc[e[0]] = e[1];
               return acc;
           }, {});
        },
  
        async mapDeep(obj, fn) {
           const self = this;
           return Array.isArray(obj)
              ? await Promise.all(obj.map(val => self.mapDeep(val, fn)))
              : typeof obj === 'object'
              ? await self.mapObj(obj, fn)
              : obj;
        }      
    },

    /**
     * Service created lifecycle event handler
     */
    async created() {
        this.serializer = new Base();
    }

}

module.exports = {
    Groups
}