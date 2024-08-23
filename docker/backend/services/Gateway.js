const ApiService = require("moleculer-web");
const { Gateway: GatewayMixin}  = require("imciors-core");


const Gateway = {
    name: "gateway",
    mixins: [ApiService, GatewayMixin],
    settings: {
        routes: [{
            path: "/",
            bodyParsers: {
                json: true
            },
            authorization: true
        },
        {
            path: "/v1/users/me",
            authorization: true,
            aliases: {
                "GET /": "v1.users.get"
            }
        },
        {
            path: "/v1/users/registerPWA",
            authorization: false,
            aliases: {
                "POST /": "v1.users.registerPWA"
            }
        },
        {
            path: "/v1/users/logInPWA",
            authorization: false,
            aliases: {
                "POST /": "v1.users.logInPWA"
            }
        },
        {
            path: "/vault/init",
            bodyParsers: {
                json: true
            },
            authorization: false,
            aliases: {
                "POST /": "v1.vault.init"
            }
        },
        {
            path: "/vault/getToken",
            bodyParsers: {
                json: true
            },
            authorization: false,
            aliases: {
                "POST /": "v1.vault.getToken"
            }
        },
        {
            path: "/vault/verify",
            bodyParsers: {
                json: true
            },
            authorization: false,
            aliases: {
                "POST /": "v1.vault.verify"
            }
        },
        {
            path: "/vault/getSealed",
            bodyParsers: {
                json: true
            },
            authorization: false,
            aliases: {
                "POST /": "v1.vault.getSealed"
            }
        },
        {
            path: "/vault/unseal",
            bodyParsers: {
                json: true
            },
            authorization: false ,
            aliases: {
                "POST /": "v1.vault.unseal"
            }
        },
        {
            path: "/v1/store/objects",
            bodyParsers: {
                json: false
            },
            aliases: {
                // File upload from HTML form
                "POST /": "multipart:v1.store.putObject",
                // File upload from AJAX or cURL
                "PUT /:objectName": "stream:v1.store.putObject",
                "GET /:objectName": "v1.store.getObject",
                "GET /stat/:objectName": "v1.store.statObject",
                "DELETE /:objectName": "v1.store.removeObject"
            },
            authorization: true,
            //onBeforeCall(ctx, route, req, res) {
            onBeforeCall(ctx, route, req) {
                _.set(ctx, "meta.filename",_.get(req,"$params.objectName",req.headers["x-imicros-filename"]));
                _.set(ctx, "meta.mimetype",req.headers["x-imicros-mimetype"]);
            }
        }],
        services: {
            users: "v1.users",
            agents: "v1.agents",
            groups: "v1.groups"
        }
    }
}
