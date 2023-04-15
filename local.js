process.env.CASSANDRA_CONTACTPOINTS = "192.168.2.124";
process.env.CASSANDRA_DATACENTER = "datacenter1";
process.env.CASSANDRA_KEYSPACE_AUTH = "imicros_auth";
process.env.CASSANDRA_PORT = 31326;
process.env.CASSANDRA_USER = "cassandra";
process.env.CASSANDRA_PASSWORD = "cassandra";
process.env.KAFKA_BROKER = "192.168.2.124:30088";
process.env.KAFKAJS_NO_PARTITIONER_WARNING = "1";

/* Jest config */
module.exports = {
    testPathIgnorePatterns: ["/dev/"],
    coveragePathIgnorePatterns: ["/node_modules/","/dev/","/test/"],
    moduleDirectories: [
      "node_modules"
    ]
};

