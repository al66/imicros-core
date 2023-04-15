/**
 * @module groups.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { v4: uuid } = require("uuid");

/**
 * 
 */
class Groups {

    /**
     * 
     * @param {Object}  param
     * @param {Object}  param.DB - instance of database
     * @param {Object}  param.logger - reference to the broker logger
     * @param {Object}  param.options - ...
     */
     constructor({ db, logger, options = {} }) {
        this.db = db;
        this.logger = logger;
        this.settings = {
            tte: 14 * 24 * 60 * 60 * 1000   // 14 days
        }
    }

    /**
     * Add a new group
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {string}     params.label - name of the group
     * 
     * @return {Object}    return
     * @property {uuid}      return.groupId - generated uuid of the group
     * @property {uuid}      return.userId - uuid of the user as extracted from the token
     * @property {string}    return.label - returned parameter
     * @property {string}    return.role - granted role: 'admin'
     * 
     */
    async add({ authToken, label = "#" }) {
        try {
            const groupId = uuid();
            const { user } = await this._getPayload({ token: authToken, type: "authToken" });
            const key = this.db.encryption.getHash(user.mail);
            const role = "admin";
            // add group
            const Group = this.db.getGroupInterface();
            await Group.add({ groupId, data: { label }});
            // add grant
            const { token: grant } = await this.db.encryption.sign({ payload: { type: "grantToken", groupId, userId: user.id, role, unrestricted: true }});
            const Grants = this.db.getGrantsInterface();
            await Grants.add({ groupId, entityId: user.id, data: { key, id: user.id, mail: user.mail, role, status: "confirmed", token: grant }});
            // add relation
            const Relation = this.db.getRelationInterface();
            await Relation.add({ key, groupId, data: { label, role }});
            return {
                groupId,
                label,
                userId: user.id,
                role
            }
        } catch (err) {
            this.logger.warn("Failed to add new group", err)
            throw new Error("Failed to add new group");
        }
    }

    /**
     * Get details of group
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - uuid of the group
     * 
     * @return {Object}     return
     * @property {uuid}     return.groupId - uuid of the group
     * @property {string}   return.label - name of the group
     * 
     */
     async get({ authToken, groupId }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // get grant
        const Grants = this.db.getGrantsInterface();
        let result = await Grants.get({ groupId, entityId: user.id });
        const grant = await this._getPayload({ token: result.token, type: "grantToken" });
        // check grant
        if (!grant.unrestricted) throw new Error("not authorized access to members");
        // get group
        const Group = this.db.getGroupInterface();
        result = await Group.get({ groupId });
        return result;
    }

    /**
     * Return members of a group
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - id of the group
     * 
     * @return {Object[]}    member
     * @property {key}       member.key - key of the member (hashed email)
     * @property {mail}      member.mail - mail of the member
     * @property {string}    member.role - granted role of the member
     * @property {string}    member.status - status: 'invited' | 'joined' | 'resigned'
     * 
     */
    async members({ authToken, groupId }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // get grant
        const Grants = this.db.getGrantsInterface();
        let result = await Grants.get({ groupId, entityId: user.id });
        const grant = await this._getPayload({ token: result.token, type: "grantToken" });
        // check grant
        if (!grant.unrestricted) throw new Error("not authorized access to members");
        // get all grants
        result = await Grants.getAll({ groupId });
        const members = [];
        for (const [id, grant] of Object.entries(result.grants)) {
            delete grant.token;
            members.push(grant); 
        }
        // add invitations
        const Invitation = this.db.getInvitationInterface();
        result = await Invitation.getAll({ groupId });
        for (let invitation of result) {
            members.push({
                mail: invitation.mail,
                key: invitation.key,
                invitation: {
                    role: invitation.role,
                    token: invitation.token
                }
            });
        }
        return members;
    }

    /**
     * Invite an user to a group - requires admin role
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - id of the group
     * @param {string}     params.mail - mail adress
     * @param {string}     params.role - invited as 'admin' | 'member'
     * 
     * @return {Object}     invitation
     * @property {uuid}     invitation.groupId - uuid of the group
     * @property {string}   invitation.key - key of the invited user (hashed email)
     * @property {string}   invitation.mail - email of the invited user
     * 
     */
     async invite({ authToken, groupId, mail, role }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // get grant
        const Grants = this.db.getGrantsInterface();
        let result = await Grants.get({ groupId, entityId: user.id });
        const grant = await this._getPayload({ token: result.token, type: "grantToken" });
        // check grant
        if (grant.role !== "admin") throw new Error("not authorized access to members");
        // get group details
        const Group = this.db.getGroupInterface();
        const group = await Group.get({ groupId });
        // create invitation
        const key = this.db.encryption.getHash(mail);
        const unrestricted = role === "admin" || role === "member" ? true : false;
        const { token: invitationToken } = await this.db.encryption.sign({ payload: { type: "invitationToken", groupId, key, mail, role, unrestricted }});
        // add invitation
        const Invitation = this.db.getInvitationInterface();
        await Invitation.add({ groupId, key, data: { key, mail, role, token: invitationToken }});
        // add relation with invitation
        const Relation = this.db.getRelationInterface();
        await Relation.add({ key, groupId, data: { label: group.label, invitation: { role, token: invitationToken } }});
        return {
            groupId,
            key,
            mail,
            token: invitationToken
        }
    }

    async uninvite({ authToken, groupId, mail }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // get grant
        const Grants = this.db.getGrantsInterface();
        let result = await Grants.get({ groupId, entityId: user.id });
        const grant = await this._getPayload({ token: result.token, type: "grantToken" });
        // check grant
        if (grant.role !== "admin") throw new Error("not authorized access to members");
        // remove invitation
        const key = this.db.encryption.getHash(mail);
        const Invitation = this.db.getInvitationInterface();
        await Invitation.remove({ groupId, key });
        // update relation
        const Relation = this.db.getRelationInterface();
        await Relation.update({ key, groupId, data: { invitation: {} }});
        return {
            groupId,
            key,
            mail
        }
    }

    /**
     * Join a group
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.invitationToken - token saved by method invite
     * 
     * @return {Object}     result
     * @property {uuid}     result.groupId - uuid of the joined group
     * @property {string}   result.role - 'admin' | 'member'
     * 
     */
     async join({ authToken, invitationToken }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // verify invitation
        const userInvitation = await this._getPayload({ token: invitationToken, type: "invitationToken" });
        // check user
        const key = this.db.encryption.getHash(user.mail);
        if (key !== userInvitation.key) throw new Error("Unvalid token");
        // get current status of invitation (may have changed or deleted meanwhile)
        const Invitation = this.db.getInvitationInterface();
        const invitation = await Invitation.get({ groupId: userInvitation.groupId, key:userInvitation.key });
        const invitationTokenGroup = await this._getPayload({ token: invitation.token, type: "invitationToken" });
        const groupId = invitationTokenGroup.groupId;
        const role = invitationTokenGroup.role;
        // add grant
        const { token: grant } = await this.db.encryption.sign({ payload: { type: "grantToken", groupId, userId: user.id, role, unrestricted: invitationTokenGroup.unrestricted }});
        const Grants = this.db.getGrantsInterface();
        await Grants.add({ groupId, entityId: user.id, data: { key, id: user.id, mail: user.mail, role, status: "confirmed", token: grant }});
        // update relation with role from invitation
        const Relation = this.db.getRelationInterface();
        await Relation.update({ key, groupId, data: { role } });
        // remove invitation
        await Invitation.remove({ groupId, key });
        return {
            groupId,
            role
        }
    }

    /**
     * Save an alias for a group
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - uuid of the group
     * @param {string}     params.alias - alias for the group
     * 
     * @return {Object}     result
     * @property {uuid}     result.groupId - returned parameter
     * @property {string}   result.alias - returned parameter
     * 
     */
    async alias({ authToken, groupId, alias }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        const key = this.db.encryption.getHash(user.mail);
        // set alias for a relation
        const Relation = this.db.getRelationInterface();
        await Relation.update({ key, groupId, data: { alias }});
        return {
            groupId,
            alias
        }
    }

    /**
     * Hide/unhide a relation
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - uuid of the group
     * @param {boolean}     params.hide - true | false
     * 
     * @return {Object}     result
     * @property {uuid}     result.groupId - returned parameter
     * @property {boolean}  result.hide - returned parameter
     * 
     */
    async hide({ authToken, groupId, unhide = false }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        const key = this.db.encryption.getHash(user.mail);
        const hide = unhide ? false : true;
        // set alias for a relation
        const Relation = this.db.getRelationInterface();
        await Relation.update({ key, groupId, data: { hide }});
        return {
            groupId,
            hide
        }
    }

    /**
     * Refuse an invitation
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.invitationToken - token saved by method invite
     * 
     * @return {Object}     result
     * @property {uuid}     result.groupId - uuid of the group of the refused invitation
     * 
     */
    async refuse({ authToken, invitationToken })  {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // verify invitation
        const userInvitation = await this._getPayload({ token: invitationToken, type: "invitationToken" });
        const groupId = userInvitation.groupId;
        // check user
        const key = this.db.encryption.getHash(user.mail);
        if (key !== userInvitation.key) throw new Error("Unvalid token");
        // remove invitation
        const Invitation = this.db.getInvitationInterface();
        await Invitation.remove({ groupId, key:userInvitation.key });
        // remove relation
        const Relation = this.db.getRelationInterface();
        await Relation.remove({ key, groupId });
        return {
            groupId
        }
    }

    async leave({ authToken, groupId })  {
        // get role
        // if admin, get members
        // check for further admins
        // if this is the last admin - reject with error
        // remove the relation
        // add inviation as member
        // remove the grant
    }

    /**
     * Remove a group member
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - uuid of the group
     * @param {uuid}       params.userId - member to be nominated
     * 
     * @return {Object}     result
     * @property {uuid}     result.groupId - uuid of the group
     * @property {uuid}     result.userId - uuid of the removed member
     * 
     */
     async remove({ authToken, groupId, userId }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // get grant
        const Grants = this.db.getGrantsInterface();
        let result = await Grants.get({ groupId, entityId: user.id });
        const grant = await this._getPayload({ token: result.token, type: "grantToken" });
        // check grant is admin
        if (grant.role !== "admin") throw new Error("not authorized access to members");
        // check role of removed user - may not be admin
        result = await Grants.get({ groupId, entityId: userId });
        const memberGrant = await this._getPayload({ token: result.token, type: "grantToken" });
        if (memberGrant.role === "admin") throw new Error("Only members can be removed. Admin's must be revoked first.");
        // delete grant
        await Grants.remove({ groupId, entityId: userId });
        // delete relation
        const Relation = this.db.getRelationInterface();
        await Relation.remove({ key: result.key, groupId });
        return {
            groupId,
            userId
        };
    }

    /**
     * Nominate a group member for admin
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - uuid of the group
     * @param {uuid}       params.userId - member to be nominated
     * 
     * @return {Object}     result
     * @property {uuid}     result.groupId - uuid of the group
     * @property {uuid}     result.admin - uuid of admin, who has nominated the member
     * @property {string}   result.command - 'nominated'
     * @property {uuid}     result.member - uuid of member, who has been nominated
     * @property {string}   result.mail - mail address of member, who has been nominated
     * 
     */
     async nominate({ authToken, groupId, userId }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // get grant
        const Grants = this.db.getGrantsInterface();
        let result = await Grants.get({ groupId, entityId: user.id });
        const grant = await this._getPayload({ token: result.token, type: "grantToken" });
        // check grant
        if (grant.role !== "admin") throw new Error("not authorized access to members");
        // create request
        result = await Grants.get({ groupId, entityId: userId });
        const key = this.db.encryption.getHash(result.mail);
        const command = "nominate";
        const { token: requestToken } = await this.db.encryption.sign({ payload: { type: "requestToken", groupId, key, userId, request: { command, role: "admin", unrestricted: true }}});
        // set nominate request in grant
        await Grants.update({ groupId, entityId: userId, data: { request: { command, role: "admin", unrestricted: true, token: requestToken }} });
        // set nominate request in relation
        const Relation = this.db.getRelationInterface();
        await Relation.update({ key, groupId, data: { request: { command, role: "admin", token: requestToken }} });
        return {
            groupId,
            admin: user.id,
            command,
            member: userId,
            mail: result.mail
        }
    }

    /**
     * Revoke admin role of a group admin
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - uuid of the group
     * @param {uuid}       params.userId - member to be nominated
     * 
     * @return {Object|Boolean}     result  | false
     * @property {uuid}     result.groupId - uuid of the group
     * @property {uuid}     result.admin - uuid of admin, who has nominated the member
     * @property {string}   result.command - 'nominated'
     * @property {uuid}     result.member - uuid of member, who has been nominated
     * @property {string}   result.mail - mail address of member, who has been nominated
     * 
     */
     async revoke({ authToken, groupId, userId }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // get grant
        const Grants = this.db.getGrantsInterface();
        let result = await Grants.get({ groupId, entityId: user.id });
        const grant = await this._getPayload({ token: result.token, type: "grantToken" });
        // check grant
        if (grant.role !== "admin") throw new Error("not authorized access to members");
        // get current command
        result = await Grants.get({ groupId, entityId: userId });
        const now = new Date().getTime();
        const command = "revoke";
        const key = this.db.encryption.getHash(result.mail);
        // if command 'revoke' and tte < current date -> execute
        if (result?.request?.command === command && result?.request?.tte < now ) {
            await Grants.update({ groupId, entityId: userId, data: { role: "member" , unrestricted: true, request: null }});
            await Relation.update({ key, groupId, data: { role: "member", request: null} });
        }
        // if command 'revoke' and tte > current date -> do nothing
        if (result?.request?.command === command && result?.request?.tte >= now ) {
            return false;
        }
        // if command <> 'revoke' override command with new command with tte = 14 days
        const tte = now +  this.settings.tte;
        if (result?.request?.command !== command ) {
            const { token: requestToken } = await this.db.encryption.sign({ payload: { type: "requestToken", groupId, key, userId, request: { command, tte, role: "member", unrestricted: true }}});
            // set revoke request in grant
            await Grants.update({ groupId, entityId: userId, data: { request: { command, tte, role: "member", unrestricted: true, token: requestToken }} });
            // set nominate request in relation
            const Relation = this.db.getRelationInterface();
            await Relation.update({ key, groupId, data: { request: { command, tte, role: "member", token: requestToken }} });
        }
        return {
            groupId,
            admin: user.id,
            command,
            tte,
            member: userId,
            mail: result.mail
        }
    }

    /**
     * Accept a request
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - uuid of the group
     * @param {string}     params.requestToken - signed token with the reuqest
     * 
     * @return {Object}     result
     * @property {uuid}     result.groupId - uuid of the group
     * @property {string}   result.command - according to the requestToken
     * 
     */
     async accept({ authToken, groupId, requestToken }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // verify request
        const payload = await this._getPayload({ token: requestToken, type: "requestToken" });
        // check subject
        if (payload.userId !== user.id) throw new Error("token is not assigned to this user");
        if (payload.groupId !== groupId) throw new Error("token is not assigned to this group");
        // get handler
        const Grants = this.db.getGrantsInterface();
        const Relation = this.db.getRelationInterface();
        // execute command
        switch (payload?.request?.command) {
            case "nominate":
                const { token: grant } = await this.db.encryption.sign({ payload: { type: "grantToken", groupId, userId: payload.userId, role: payload.request.role, unrestricted: payload.request.unrestricted }});
                await Grants.update({ groupId, entityId: payload.userId, data: { role: payload.request.role , unrestricted: payload.request.unrestricted, token: grant, request: null }});
                await Relation.update({ key: payload.key, groupId: payload.groupId, data: { role: payload.request.role, request: null} });
                break;
            case "revoke":
                const { token: memberGrant } = await this.db.encryption.sign({ payload: { type: "grantToken", groupId, userId: payload.userId, role: payload.request.role, unrestricted: payload.request.unrestricted }});
                await Grants.update({ groupId, entityId: payload.userId, data: { role: payload.request.role , unrestricted: payload.request.unrestricted, token: memberGrant, request: null }});
                await Relation.update({ key: payload.key, groupId: payload.groupId, data: { role: payload.request.role, request: null} });
                break;
        }
        return {
            groupId,
            command: payload?.request?.command
        }
    }

    /**
     * Decline a request
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * @param {uuid}       params.groupId - uuid of the group
     * @param {string}     params.requestToken - signed token with the reuqest
     * 
     * @return {Object}     result
     * @property {uuid}     result.groupId - uuid of the group
     * @property {string}   result.command - according to the requestToken
     * 
     */
     async decline({ authToken, groupId, requestToken }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        // verify request
        const payload = await this._getPayload({ token: requestToken, type: "requestToken" });
        // check
        if (payload.userId !== user.id) throw new Error("token is not assigned to this user");
        // get handler
        const Grants = this.db.getGrantsInterface();
        const Relation = this.db.getRelationInterface();
        // get current command
        let result = await Grants.get({ groupId, entityId: payload.userId });
        // check grant
        if (result?.request?.command !== payload?.request?.command) return;
        // if same command -> delete command
        await Grants.update({ groupId, entityId: payload.userId, data: { request: null }});
        await Relation.update({ key: payload.key, groupId: payload.groupId, data: { request: null} });
        return {
            groupId,
            command: payload?.request?.command
        }
    }

    /**
     * List all groups with relation to the user
     *
     * @param {Object}     params
     * @param {string}     params.authToken - internal auth token, emitted by the gateway
     * 
     * @return {Object[]}    return - array of groups
     * @property {uuid}      return.groupId - uuid of the group
     * @property {uuid}      return.userId - uuid of the user as extracted from the token
     * @property {string}    return.label - users name of the group
     * @property {string}    return.role - granted role
     * 
     */
     async list({ authToken }) {
        const { user } = await this._getPayload({ token: authToken, type: "authToken" });
        const key = this.db.encryption.getHash(user.mail);
        // get all relations
        const Relation = this.db.getRelationInterface();
        const result = await Relation.getAll({ key });
        const groups = [];
        for (const [id, group] of Object.entries(result.relations)) {
            groups.push(group); 
        }
        return groups;
    }

    requestDeletion({ authToken }) {
        // check grant
        // get members
        // check mmebers count
        // if > 1 reject request
        // return deletionToken
    }

    delete({ deletionToken }) {
        // verify deletionToken
        // delete group 
    }

    async _getPayload({ token, type }) {
        const { payload } = await this.db.encryption.verify({ token });
        if (payload.type !== type) throw new Error(`Wrong token - token of type ${type} expected`);
        return payload;
    }

}

/*
module.exports = {
    Groups
};
*/
