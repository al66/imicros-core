"use strict";

const { AuthApplication } = require("../lib/application/main");
const { MemoryDatabase } = require("../lib/application/database/memory");
const {
        RequestNewUser,
        CreateGroup,
        RenameGroup,
        InviteUser,
        JoinGroup
    } = require("../lib/application/commands/commands");
const { 
        UserCreated,
        GroupCreated,
        GroupRenamed,
        GroupMemberJoined,
        UserInvited,
        UserJoined
    } = require("../lib/application/events/events");
const { 
        GetGroup
    } = require("../lib/application/queries/queries");
const { 
        GroupAlreadyExists,
        GroupDoesNotExists,
        RequiresAdminRole
    } = require("../lib/application/exceptions/exceptions");

const { v4: uuid } = require("uuid");

describe("Test aggregate Group", () => {
    
    const application = new AuthApplication({ db: new MemoryDatabase() });
    let user, groupId, groupLabel, userB, eventA, eventB, eventC;

    beforeAll(() => { 
        groupId = uuid();
        groupLabel = "my first group";
        user = {
            uid: uuid(),
            mail: "admin@imicros.de",
            password: "?My::secret!",
            locale: "enUS"
        };
        userB = {
            uid: uuid(),
            mail: "userB@imicros.de"
        };
    })

    describe("Test create user", () => {
        it("it should create a user", async () => {
            application.execute(new RequestNewUser({ 
                userId: user.uid,
                email: user.mail,
                password: user.password,
                locale: user.locale
            })).then((events) => {
                expect(events[0] instanceof UserCreated).toEqual(true);
                expect(events[0]).toEqual({
                    createdAt: expect.any(Number),
                    userId: user.uid,
                    email: user.mail,
                    passwordHash: expect.any(String),
                    locale: user.locale
                });
            })
        })
        it("it should fail to create the user a second time", async () => {
            expect.assertions(2);
            application.execute(new RequestNewUser({ 
                userId: user.uid,
                email: user.mail,
                password: user.password,
                locale: user.locale
            })).catch((err) => {
                expect(err.message).toEqual("UserAlreadyExists");
                expect(err.email).toEqual(user.mail);
            });
        })
        it("it should fail to create an existing user again", async () => {
            expect.assertions(2);
            application.execute(new RequestNewUser({ 
                userId: uuid(),
                email: user.mail,
                password: user.password,
                locale: user.locale
            })).catch((err) => {
                expect(err.message).toEqual("UserAlreadyExists");
                expect(err.email).toEqual(user.mail);
            });
        })
    })

    describe("Test create group", () => {

        it("it should create a new group", () => {
            application.execute(new CreateGroup({ 
                user,
                groupId,
                label: groupLabel,
            })).then((events) => {
                expect(events[0] instanceof GroupCreated).toEqual(true);
                expect(events[0]).toEqual({
                    createdAt: expect.any(Number),
                    groupId,
                    label: groupLabel
                });
                expect(events[1] instanceof GroupMemberJoined).toEqual(true);
                eventA = events[0];
                eventB = events[1];
            })
        });

        it("it should apply the event 'GroupCreated'", async () => {
            const result = await application.apply(eventA);
            expect(result).toEqual(0);
        })

        it("it should apply the event 'GroupMemberJoined'", async () => {
            const result = await application.apply(eventB);
            expect(result).toEqual(1);
        })

        it("it should fail to create the same group again", () => {
            expect.assertions(2);
            application.execute(new CreateGroup({ 
                user,
                groupId,
                label: groupLabel,
            })).catch((err) => {
                expect(err.message).toEqual(GroupAlreadyExists.name);
                expect(err.uid).toEqual(groupId);
            })
        });

        it("it should retrieve the created group", async () => {
            application.query(new GetGroup({ 
                user,
                groupId
            })).then((group) => {
                expect(group).toEqual({
                    uid: groupId,
                    createdAt: expect.any(Number),
                    label: groupLabel,
                    members: [{ user, role: "admin" }]
                });
            })
        })

        it("it should fail to retrieve a group", () => {
            expect.assertions(2);
            application.query(new GetGroup({ 
                user: userB,
                groupId
            })).catch((err) => {
                expect(err.message).toEqual("OnlyAllowedForMembers");
                expect(err.query).toEqual("GetGroup");
            });
        })

        it("it should rename the group", () => {
            application.execute(new RenameGroup({ 
                user,
                groupId,
                label: groupLabel,
            })).then((events) => {
                expect(events[0] instanceof GroupRenamed).toEqual(true);
                expect(events[0]).toEqual({
                    user,
                    groupId,
                    label: groupLabel
                });
            })
        });

        it("it should fail to rename the group", () => {
            expect.assertions(2);
            application.execute(new RenameGroup({ 
                userB,
                groupId,
                label: groupLabel,
            })).catch((err) => {
                expect(err.message).toEqual("RequiresAdminRole");
                expect(err.command).toEqual("RenameGroup");
            })
        });

 });

});