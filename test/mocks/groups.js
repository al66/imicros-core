"use strict";

const { Encryption: EncryptionClass } = require("../../lib/classes/util/encryption");
const { Serializer: Base } = require("../../lib/classes/util/serializer");
const { Constants } = require("../../lib/classes/util/constants");
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
 } = require("../../lib/classes/events/events");
 
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
 } = require("../../lib/classes/exceptions/exceptions");
 

const defaultKey = uuid();
const keys = {
    default: defaultKey,
    store: {
        [defaultKey]: {
            key: defaultKey,
            exp: Date.now() + 1000 * 60 * 60 * 24 * 365
        }
    }
};
const accessTokenStore = {};
const mockSecret = uuid();

function getTestAccessToken(groupId) {
      // get or build dummy token
      if(!accessTokenStore[groupId]) {
         accessTokenStore[groupId] = jwt.sign({ 
            type: Constants.TOKEN_TYPE_ACCESS_INTERNAL, 
            nodeID: "AnyNodeID",
            groupId: groupId, 
            adminGroup: false
         },mockSecret);    
      }
      return accessTokenStore[groupId];
}


const GroupsServiceMock = {
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
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: access?.service });
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
               if (!groupId) throw new UnvalidRequest({ info: "groupId is missing" });
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: access?.service });
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
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: access?.service });
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
               const keyProvider = this.buildKeyProvider({ keys , owner: groupId, service: access?.service });
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
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: access?.service });
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
               this.logger.info("call decryptValues", ctx.params.data, ctx.meta);
               const { decoded: access } = await this.getAccess(ctx);
               const groupId = access?.groupId || ctx.meta?.acl?.ownerId;
               //console.log(ctx.meta);
               const keyProvider = this.buildKeyProvider({ keys, owner: groupId, service: access?.service });
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
         },
         
         grantServiceAccess: {
            visibility: "public",
            params: {
               groupId: { type: "uuid"},
               serviceId: { type: "string"},
               serviceName: { type: "string"},
               hash: { type: "string"}
            },
            async handler (ctx) {
               const events = [];
                  // return result
               return true;
            }
         },

         requestAccessForService: {
            visibility: "public",
            params: {
               groupId: { type: "uuid" },
               serviceId: { type: "string" },
               hash: { type: "string" }
               },
            async handler (ctx) {
               // get or build dummy token
               if (!accessTokenStore[ctx.params.groupId]) {
                  accessTokenStore[ctx.params.groupId] = jwt.sign({ 
                     type: Constants.TOKEN_TYPE_ACCESS_INTERNAL, 
                     nodeID: ctx.broker.nodeID,
                     groupId: ctx.params.groupId, 
                     adminGroup: false,
                     service: ctx.params.service
                  },mockSecret);    
               }
               // return result
               return { accessToken: accessTokenStore[ctx.params.groupId] };
            }
         }
            
            
    },

    methods: {

        async getAccess(ctx) {
            const decoded = await jwt.decode(ctx.meta?.accessToken || ctx.meta?.acl?.accessToken);
            //console.log("getAccess", { decoded, meta: ctx.meta, token: ctx.meta?.accessToken || ctx.meta?.acl?.accessToken });
            return { decoded }; 
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
    GroupsServiceMock,
    getTestAccessToken
}