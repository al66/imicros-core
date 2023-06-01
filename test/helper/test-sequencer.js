"use strict";

const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
    /**
     * Select tests for shard requested via --shard=shardIndex/shardCount
     * Sharding is applied before sorting
     */
    shard(tests, {shardIndex, shardCount}) {
        return [...tests];
    }

    /**
     * Sort tests by filename
     * Sharding is applied before sorting
     * @param {Array} tests Array of tests
     * @returns {Array} Sorted tests
     * @memberof CustomSequencer
     * @override
     */

    sort(tests) {
        const copyTests = Array.from(tests);
        return copyTests.sort((testA, testB) => {
            const fileA = testA.path;
            const fileB = testB.path;
            if (fileA === fileB) {
               return 0;
            }  
            return fileA > fileB ? 1 : -1;
        });
    }
    
}

module.exports = CustomSequencer;
