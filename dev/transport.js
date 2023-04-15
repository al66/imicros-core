const { ServiceBroker } = require("moleculer");

const EncryptionMiddleware = () => { return {
    name: "Encryption",
	created() {
        logger = this.logger;
        /* istanbul ignore next */
        this.logger.info(`The transmission is ENCRYPTED'.`);
    },

    transporterSend(next) {
        return async (topic, data, meta) => {
            if (["REQ","RES"].indexOf(topic) >= 0) {
                await brokerB.waitForServices(["v1.vault"]);
                console.log("Send");
                console.log("topic", topic);
                console.log("data",data.toString());
                console.log("meta",meta);
            }
            return next(topic, data, meta);
        };
    },

    transporterReceive(next) {
        return async (cmd, data, s) => {
            try {
                if (["REQ","RES"].indexOf(cmd) >= 0) {
                    await brokerB.waitForServices(["v1.vault"]);
                    console.log("Receive");
                    console.log("cmd",cmd);
                    console.log("data",data.toString());
                    //console.log("s",s);
                }
                return next(cmd, data, s);
            } catch (err) {
                logger.error("Received packet decryption error.", err);
            }
        };
    }
} }

const Vault = {
    name: "vault",
    version: 1,
    actions: {
        hash: {
            params: {
                key: { type: "string" }
            },
            handler (ctx) {
                return ctx.params.key;
            }
        }
    }
}

const Service = {
    name: "test",
    version: 1,
    actions: {
        task: {
            params: {
                any: { type: "string" }
            },
            handler (ctx) {
                return true;
            }
        }
    }
}

const transporter = {
    type: "TCP",
    options: {
        udpDiscovery: false,
        urls: [
            "127.0.0.1:9500/node-1",
            "127.0.0.1:9501/node-2"
        ],
    }
}

const brokerA = new ServiceBroker({
    nodeID: "node-1",
    middlewares: [EncryptionMiddleware()],
    transporter: transporter,
    logger: console,
    logLevel: "info" //"debug"
});

const brokerB = new ServiceBroker({
    nodeID: "node-2",
    middlewares: [EncryptionMiddleware()],
    transporter: transporter,
    logger: console,
    logLevel: "info" //"debug"
});

async function run  ( ) {
    brokerA.createService(Service);
    await brokerA.start();
    brokerB.createService(Vault);
    await brokerB.start();
    await brokerB.waitForServices(["v1.test"]);
    await brokerB.call("v1.test.task",{ any: "my param" });
    await brokerA.stop();
    await brokerB.stop();
}

run();