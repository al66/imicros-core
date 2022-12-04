/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { 
    AgentCreated,
    AgentRenamed,
    CredentialsCreated,
    CredentialsDeleted,
    AgentLoggedIn,
    AgentLoggedOut,
    AgentDeleted
} = require("../events/events");
 
const { 
    RequiresAdminRole,
    RequiresUnrestrictedAccess,
    AgentAlreadyExists,
    AgentDoesNotExist,
    UnvalidToken,
    CredentialsDoNotExist,
    UnvalidRequest
} = require("../exceptions/exceptions");
 
 const { AgentRepository } = require("../repositories/repositories");
 const { v4: uuid } = require("uuid");

 module.exports = {
    name: "agents",
 
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
        * Create a new agent
        * 
        * @command
        * @param {Uuid} agentId
        * @param {String} label 
        * 
        * @emits AgentCreated
        * 
        * @throws RequiresAdminRole
        * 
        * @returns {Boolean} accepted
        */
       create: {
          params: {
             agentId: { type: "uuid" },
             label: { type: "string" }
          },
          async handler (ctx) {
             const events = [];
            // validate command
            const { user } = await this.getUser(ctx);
            const { acl } = await this.getAcl(ctx);
            if (acl.userId !== user.uid) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
            const agentId = ctx.params.agentId;
            if (acl.role !== "admin") throw new RequiresAdminRole({ groupId: acl.groupId }); 
            const agent = await this.agentRepository.getById({ uid: agentId });
            if (agent.isPersistant()) throw new AgentAlreadyExists({ uid: agentId });
            // apply command
            events.push(agent.apply(new AgentCreated({ groupId: acl.groupId, agentId, label: ctx.params.label })));
            // persist
            await agent.commit();
             // return result
             return true;
          }
       },
 
       /**
        * Rename agent
        * 
        * @command
        * @param {Uuid} agentId
        * @param {String} label 
        * 
        * @emits AgentRenamed
        * 
        * @throws AgentDoesNotExists
        * @throws RequiresAdminRole
        * 
        * @returns {Boolean} accepted
        */
       rename: {
          params: {
             agentId: { type: "uuid" },
             label: { type: "string" }
          },
          async handler (ctx) {
             const events = [];
             // validate command
             const { user } = await this.getUser(ctx);
             const { acl } = await this.getAcl(ctx);
             if (acl.userId !== user.uid) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
             if (acl.role !== "admin") throw new RequiresAdminRole({ groupId: acl.groupId }); 
             const agentId = ctx.params.agentId;
             const agent = await this.agentRepository.getById({ uid: agentId });
             if (acl.groupId !== agent.getGroupId()) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
             if (!agent.isPersistant()) throw new AgentDoesNotExist({ uid: agentId });
             // apply command
             events.push(agent.apply(new AgentRenamed({ groupId: acl.groupId, agentId, label: ctx.params.label })));
             // persist
             await agent.commit();
              // return result
              return true;
           }
        },
 
       /**
        * Create credentials
        * 
        * @command
        * @param {Uuid} agentId
        * @param {Uuid} credentialsId 
        * 
        * @emits CredentialsCreated
        * 
        * @throws UnvalidToken
        * @throws AgentDoesNotExists
        * @throws RequiresAdminRole
        * 
        * @returns {Boolean} accepted
        */
        createCredentials: {
            params: {
                agentId: { type: "uuid" },
                credentialsId: { type: "uuid" }
            },
            async handler (ctx) {
                const events = [];
                // validate command
                const { user } = await this.getUser(ctx);
                const { acl } = await this.getAcl(ctx);
                if (acl.userId !== user.uid) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                if (acl.role !== "admin") throw new RequiresAdminRole({ groupId: acl.groupId }); 
                const agentId = ctx.params.agentId;
                const credentialsId = ctx.params.credentialsId;
                const secret = this.encryption.randomBytes();
                const hashedSecret = this.encryption.getHash(secret);
                const encryptedSecret = await this.encryption.encryptData(secret);
                const credentials = {
                    uid: credentialsId,
                    hashedSecret,
                    encryptedSecret
                }
                const agent = await this.agentRepository.getById({ uid: agentId });
                if (acl.groupId !== agent.getGroupId()) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                if (!agent.isPersistant()) throw new AgentDoesNotExist({ uid: agentId });
                // apply command
                events.push(agent.apply(new CredentialsCreated({ groupId: acl.groupId, agentId, credentialsId, credentials })));
                // persist
                await agent.commit();
                 // return result
                 return true;
            }
        },

       /**
        * Delete credentials
        * 
        * @command
        * @param {Uuid} agentId
        * @param {Uuid} credentialsId 
        * 
        * @emits CredentialsDeleted
        * 
        * @throws UnvalidToken
        * @throws AgentDoesNotExists
        * @throws CredentialsDoNotExist
        * @throws RequiresAdminRole
        * 
        * @returns {Boolean} accepted
        */
        deleteCredentials: {
            params: {
                agentId: { type: "uuid" },
                credentialsId: { type: "uuid" }
            },
            async handler (ctx) {
                const events = [];
                // validate command
                const { user } = await this.getUser(ctx);
                const { acl } = await this.getAcl(ctx);
                if (acl.userId !== user.uid) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                if (acl.role !== "admin") throw new RequiresAdminRole({ groupId: acl.groupId }); 
                const agentId = ctx.params.agentId;
                const credentialsId = ctx.params.credentialsId;
                const agent = await this.agentRepository.getById({ uid: agentId });
                if (acl.groupId !== agent.getGroupId()) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                if (!agent.isPersistant()) throw new AgentDoesNotExist({ uid: agentId });
                if (!agent.hasCredentials({ credentialsId })) throw new CredentialsDoNotExist({ uid: credentialsId });
                // apply command
                events.push(agent.apply(new CredentialsDeleted({ groupId: acl.groupId, agentId, credentialsId })));
                // persist
                await agent.commit();
                 // return result
                 return true;
            }
        },

        /**
         * Log in agent
         * 
         * @command
         * @param {Uuid} agentId
         * @param {String} secret 
         * 
         * @emits AgentLoggedIn
         * 
         * @throws UnvalidRequest
         * 
         * @returns {Object} result - exceptional case, where command returns data of the applied event! 
         */
        logIn: {
            params: {
                agentId: { type: "uuid" },
                secret: { type: "string" }
            },
            async handler (ctx) {
                const events = [];
                // validate command
                const agentId = ctx.params.agentId;
                const hashedSecret = this.encryption.getHash(ctx.params.secret);
                const agent = await this.agentRepository.getById({ uid: agentId });
                if (!agent.isPersistant()) throw new UnvalidRequest({ agentId });
                if (!agent.isValidSecret({ hashedSecret })) throw new UnvalidRequest({ agentId });
                const sessionId = uuid();
                const authToken = await this.encryption.sign({ 
                    payload: { 
                        type: "authToken", 
                        agentId, 
                        sessionId 
                    }, options: {}
                });
                // apply command
                events.push(agent.apply(new AgentLoggedIn({ agentId, authToken: authToken.token, sessionId })));
                const authObject = {
                    authToken: authToken.token,
                    sessionId
                }
                // persist
                await agent.commit();
                // return result
                return authObject;
            }
        },

        /**
         * Log out user
         * 
         * @command
         * 
         * @emits AgentLoggedOut
         * 
         * @throws UnvalidToken
         * 
         * @returns {Boolean} accepted
         */
        logOut: {
            async handler(ctx) {
                const events = [];
                // validate/prepeare command
                const { agent, decoded } = await this.getAgent(ctx);
                // apply command
                events.push(agent.apply(new AgentLoggedOut({ agentId: agent.getId(), authToken: ctx.meta?.authToken, sessionId: decoded.payload.sessionId })));
                // persist
                await agent.commit();
                // return result
                return true;
            }
        },
        
       /**
        * Delete agent
        * 
        * @command
        * @param {Uuid} agentId
        * 
        * @emits AgentDeleted
        * 
        * @throws UnvalidToken
        * @throws RequiresAdminRole
        * @throws AgentDoesNotExist
        * 
        * @returns {Boolean} accepted
        */
        delete: {
            params: {
                agentId: { type: "uuid"}
            },
            async handler (ctx) {
                const events = [];
                // validate command
                const { user } = await this.getUser(ctx);
                const { acl } = await this.getAcl(ctx);
                if (acl.userId !== user.uid) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                if (acl.role !== "admin") throw new RequiresAdminRole({ groupId: acl.groupId }); 
                const agentId = ctx.params.agentId;
                const agent = await this.agentRepository.getById({ uid: agentId });
                if (acl.groupId !== agent.getGroupId()) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                if (!agent.isPersistant()) throw new AgentDoesNotExist({ uid: agentId });
                // apply command - to emit event before deletion
                events.push(agent.apply(new AgentDeleted({ groupId: acl.groupId, agentId, deletedBy: user.uid })));
                // persist - to emit event before deletion
                await agent.commit();
                // delete aggregate
                await this.agentRepository.delete({ uid: agentId });
                 // return result
                 return true;
            }
        },
 
        /**
        * Get agent details
        * 
        * @query
        * @param {Uuid} agentId 
        * 
        * @returns {Object} agent details
        */
        get: {
            params: {
                agentId: { type: "uuid" }
            },
            async handler (ctx) {
                // validate query
                const { user } = await this.getUser(ctx);
                const { acl } = await this.getAcl(ctx);
                if (acl.userId !== user.uid) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                if (acl.unrestricted !== true) throw new RequiresUnrestrictedAccess({ groupId: acl.groupId }); 
                const agentId = ctx.params.agentId;
                const agent = await this.agentRepository.getById({ uid: agentId });
                if (acl.groupId !== agent.getGroupId()) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                const result = agent.getDetails();
                if (result.credentials) {
                    Object.entries(result.credentials).forEach(([key,value]) => {
                        delete result.credentials[key].encryptedSecret;
                        delete result.credentials[key].hashedSecret;
                    })
                }
                // return result
                return result;
            }
        },

        /**
        * Get decrypted credentials 
        * 
        * @query
        * @param {Uuid} agentId 
        * @param {Uuid} credentialsId 
        * 
        * @returns {Object} credentials
        */
         getCredentials: {
            params: {
                agentId: { type: "uuid" },
                credentialsId: { type: "uuid" }
            },
            async handler (ctx) {
                // validate query
                const { user } = await this.getUser(ctx);
                const { acl } = await this.getAcl(ctx);
                if (acl.userId !== user.uid) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                if (acl.role !== "admin") throw new RequiresAdminRole({ groupId: acl.groupId }); 
                const agentId = ctx.params.agentId;
                const credentialsId = ctx.params.credentialsId;
                const agent = await this.agentRepository.getById({ uid: agentId });
                if (acl.groupId !== agent.getGroupId()) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                const credentials = agent.getCredentials({ credentialsId })
                if (credentials) {
                    credentials.secret = await this.encryption.decryptData(credentials.encryptedSecret);
                    delete credentials.encryptedSecret;
                    delete credentials.hashedSecret;
                }
                // return decrypted credentials  
                return credentials;
            }
        },
 
        /**
         * Verify authentification token & add agent token
         * 
         * @query
         * 
         * @returns {String} agentToken
         */
        verifyAuthToken: {
            visibility: "public",
            async handler(ctx) {
                // validate/prepeare query
                const { agent, decoded } = await this.getAgent(ctx);
                const { token: agentTokenSigned } = await this.encryption.sign({ payload: { 
                    type: "agentToken", 
                    agentId: agent.getId(), 
                    sessionId: decoded.payload.sessionId,
                    agent: agent.getTokenData()
                }});
                ctx.meta.agentToken = agentTokenSigned;
                return agentTokenSigned;
            }
        },

        //TODO
        getLog: {
            params: {
                agentId: { type: "uuid" },
                from: { type: "date", convert: true, optional: true },
                to: { type: "date", convert: true, optional: true }
            },
            async handler (ctx) {
                // validate query
                const { user } = await this.getUser(ctx);
                const { acl } = await this.getAcl(ctx);
                if (acl.userId !== user.uid) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                const agentId = ctx.params.agentId;
                const agent = await this.agentRepository.getById({ uid: agentId });
                if (acl.groupId !== agent.getGroupId()) throw new UnvalidToken({ token: ctx.meta?.acl?.aclToken });
                // get log
                const log = await this.agentRepository.getLog({ uid: agentId, from: ctx.params.from, to: ctx.params.to });
                // return result
                return log;
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
    methods: {
 
        async getAcl(ctx) {
            const { acl } = ctx.meta;
            const decoded = await this.encryption.verify({ token: acl.token });
            return { acl: decoded.payload }; 
        },

        async getUser(ctx) {
            const userToken = ctx.meta?.userToken;
            const decoded = await this.encryption.verify({ token: userToken });
            return { user: decoded.payload.user }; 
        },

        async getAgent ({ meta }) {
            const decoded = await this.encryption.verify({ token: meta?.authToken });
            const agent = await this.agentRepository.getById({ uid: decoded.payload.agentId });
            if (!agent.isActiveSession(decoded.payload.sessionId))  throw new UnvalidToken({ token: meta?.authToken });
            return {
                agent,
                decoded
            };
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
 
       this.agentRepository = new AgentRepository({ 
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