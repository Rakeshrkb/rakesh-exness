const originalSetTimeout = globalThis.setTimeout;
// @ts-ignore
globalThis.setTimeout = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
  return originalSetTimeout(handler, Math.max(0, timeout || 0), ...args);
};
import  {Kafka, logLevel } from 'kafkajs';
import { sendOrderUpdateToWSS } from "./redis";

export const kafka = new Kafka({
  clientId: 'matching-engine',
  brokers: ['localhost:9092'],
  logLevel: logLevel.WARN,
    connectionTimeout: 10000,
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


// create a kafka consumer
export const limitOrderConsumer = kafka.consumer({ groupId: 'matching-engine-group',
    sessionTimeout: 60000, // 60 seconds
    heartbeatInterval: 20000, // 20 seconds
    maxWaitTimeInMs: 5000, // max time to wait for messages in each poll
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
 


export const startKafkaConsumer = async () => {
    try{
        await limitOrderConsumer.connect();
        await limitOrderConsumer.subscribe({ topic: 'limit-orders', fromBeginning: false });
        await limitOrderConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const data = JSON.parse(message.value?.toString() ?? '{}');
                    console.log(`[INFO] Received Order`, data);
                    const orderId = data.orderId;
                    await sendOrderUpdateToWSS(orderId, JSON.stringify(data));
                } catch (error) {
                    console.error('[ERROR] Error processing message:', error);
                }
            },
        });
    } catch (error) {
        console.error('[ERROR] Error starting Kafka Consumer:', error);
    }
}


export const stopKafkaConsumer = async () => {
    try {
        await limitOrderConsumer.disconnect();
    } catch (error) {
        console.error('[ERROR] Failed to disconnect Kafka Consumer:', error);
    }
}