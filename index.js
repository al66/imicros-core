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
    StoreService: require("./lib/services/minio"),
    AdminService: require("./lib/services/admin"),
    FeelService: require("./lib/services/feel"),
    TemplateService: require("./lib/services/template"),
    SmtpService: require("./lib/services/smtp"),
    MapService: require("./lib/services/map"),
    ExchangeService: require("./lib/services/exchange"),
    // provider
    StoreProvider: require("./lib/provider/store").StoreProvider,
    VaultProvider: require("./lib/provider/vault").VaultProvider,
    GroupsProvider: require("./lib/provider/groups").GroupsProvider,
    // mixins
    GatewayMixin: require("./lib/mixins/gateway.mixin"),
    // middlewares
    Authorized: require("./lib/middleware/acl"),
    Transit: require("./lib/middleware/transit"),
    // others
    Exceptions: require("./lib/classes/exceptions/exceptions"),
    Unseal: require("./lib/services/unseal"),
    Map: require("./lib/classes/map/map").Map
};
 