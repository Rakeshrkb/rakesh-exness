import { Router } from 'express';
import { signUp, signIn } from '../controllers/auth.controller';


const authRouter = Router();

    authRouter.post('/signUp', signUp);

    authRouter.post('/signIn', signIn);

export default authRouter;