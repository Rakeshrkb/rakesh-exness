import { handleVerifyToken } from './jwt';
import { handleSubscribe, handleUnsubscribe } from './subscriptionManager';


export const routeMessage = (message: any, ws: any) => {
    switch (message.action) {
        case "AUTH":
            handleVerifyToken(message.token, ws);
            break;
        case "SUBSCRIBE":
            handleSubscribe(message.asset, ws);
            break;
        case "UNSUBSCRIBE":
            handleUnsubscribe(message.asset, ws);
            break;
        default:
            console.warn("Unknown action:", message.action);
            ws.send(
                JSON.stringify({
                    action: "ERROR",
                    result: "failure",
                    reason: "Unknown action",
                }),
            );
    }
};