const { v4: uuid } = require("uuid");

// ---- CASSANDRA ----
process.env.CASSANDRA_CONTACTPOINTS = "192.168.2.124";
process.env.CASSANDRA_DATACENTER = "datacenter1";
process.env.CASSANDRA_KEYSPACE_AUTH = "imicros_auth";
process.env.CASSANDRA_KEYSPACE_EXCHANGE = "imicros_exchange";
process.env.CASSANDRA_KEYSPACE_FLOW = "imicros_flow";
process.env.CASSANDRA_KEYSPACE_DECISION = "imicros_decision";
process.env.CASSANDRA_PORT = 31326;
process.env.CASSANDRA_USER = "cassandra";
process.env.CASSANDRA_PASSWORD = "cassandra";
// ---- KAFKA ----
process.env.KAFKA_BROKER = "192.168.2.124:30088";
process.env.KAFKAJS_NO_PARTITIONER_WARNING = "1";
// ---- NATS ----
process.env.NATS_TRANSPORTER = "nats://192.168.2.124:30284";
// ---- MINIO ----
process.env.MINIO_ENDPOINT = "192.168.2.124";
process.env.MINIO_PORT = 30968; //9400;
process.env.MINIO_NO_SSL = "true";
process.env.MINIO_ACCESS_KEY = "minio"; // "AKIAIOSFODNN7EXAMPLE";
process.env.MINIO_SECRET_KEY = "minio123"; // "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
// ---- Vault init token ----
process.env.MASTER_TOKEN = "074e48c8e3c0bc19f9e22dd7570037392"; //crypto.randomBytes(32).toString("hex");
// ---- EXCHANGE ----
process.env.EXCHANGE_URL = "192.168.2.124/api/v1/exchange";
// ---- SERVICE ID's ----
process.env.SERVICE_ID_EXCHANGE = uuid()
process.env.SERVICE_ID_FLOW = uuid()

// ---- LOG ---- from command line parameter in package.json
process.env.LOG = process.argv.filter((x) => x.startsWith('--log='))[0]?.split('=')[1] || 'jest' // default

/* Jest config */
module.exports = {
    testPathIgnorePatterns: ["/dev/"],
    coveragePathIgnorePatterns: ["/node_modules/","/dev/","/test/"],
    moduleDirectories: [
      "node_modules"
    ],
    testEnvironment: "node",
    testTimeout: 10000,
    testSequencer: "./test/helper/test-sequencer.js",
    setupFilesAfterEnv: ["./test/helper/log.js","./test/helper/expect.js"],
    globals: require("./test/helper/global.js")
};

