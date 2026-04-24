import { User } from "../types"; // adjust path

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}