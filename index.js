/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

module.exports = {
    // services
    UsersService: require("./lib/services/users"),
    GroupsService: require("./lib/services/groups"),
    AgentsService: require("./lib/services/agents"),
    VaultService: require("./lib/services/vault"),
    StoreService: require("./lib/store/minio"),
    AdminService: require("./lib/services/admin"),
    FeelService: require("./lib/feel/feel"),
    TemplateService: require("./lib/templates/template"),
    SmtpService: require("./lib/mails/smtp"),
    MapService: require("./lib/map/map.service"),
    // mixins
    StoreMixin: require("./lib/store/store.mixin"),
    GatewayMixin: require("./lib/gateway/gateway.mixin"),
    // middlewares
    Transit: require("./lib/middleware/transit"),
    // others
    Exceptions: require("./lib/exceptions/exceptions"),
    Unseal: require("./lib/services/unseal"),
    Map: require("./lib/map/map").Map
};
 