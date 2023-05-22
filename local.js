process.env.CASSANDRA_CONTACTPOINTS = "192.168.2.124";
process.env.CASSANDRA_DATACENTER = "datacenter1";
process.env.CASSANDRA_KEYSPACE_AUTH = "imicros_auth";
process.env.CASSANDRA_PORT = 31326;
process.env.CASSANDRA_USER = "cassandra";
process.env.CASSANDRA_PASSWORD = "cassandra";
process.env.KAFKA_BROKER = "192.168.2.124:30088";
process.env.KAFKAJS_NO_PARTITIONER_WARNING = "1";
process.env.NATS_TRANSPORTER = "nats://192.168.2.124:30284";
process.env.MASTER_TOKEN = "074e48c8e3c0bc19f9e22dd7570037392"; //crypto.randomBytes(32).toString("hex");

/* Jest config */
module.exports = {
    testPathIgnorePatterns: ["/dev/"],
    coveragePathIgnorePatterns: ["/node_modules/","/dev/","/test/"],
    moduleDirectories: [
      "node_modules"
    ]
};

