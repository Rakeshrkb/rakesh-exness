const originalSetTimeout = globalThis.setTimeout;
// @ts-ignore
globalThis.setTimeout = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
  return originalSetTimeout(handler, Math.max(0, timeout || 0), ...args);
};
import  {Kafka, logLevel } from 'kafkajs';
import { KAFKA_BROKER } from "../constants/envConstants";

export const kafka = new Kafka({
  clientId: 'matching-engine',
  brokers: [KAFKA_BROKER],
  logLevel: logLevel.NOTHING,
    connectionTimeout: 30000,
    requestTimeout: 30000,
    retry: {
      initialRetryTime: 300,
      retries: 10,
      maxRetryTime: 30000,
      multiplier: 2,
      restartOnFailure: async (e: any) => {
        return e.retriable === true;
      },
    },
});

// create a kafka producer
export const matching_engine_producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionTimeout: 30000, // this avoids negative timeout error
    retry: {
        retries: 10,
        initialRetryTime: 300,
        maxRetryTime: 30000,
        multiplier: 2,
        restartOnFailure: async (e: any) => {
            return e.retriable === true;
        },
    },
});


// start the producer
export const startMatchingEngineProducer = async () => {
    await matching_engine_producer.connect();
};

// stop the producer
export const stopMatchingEngineProducer = async () => {
    await matching_engine_producer.disconnect();
};