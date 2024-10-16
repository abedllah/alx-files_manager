import dbClient from '../utils/db.js';
import crypto from 'crypto';

class UsersController {
    static async postNew(req, res) {
        const { email, password } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Missing email' });
        }

        if (!password) {
            return res.status(400).json({ error: 'Missing password' });
        }

        const emailExists = await dbClient.usersCollection.findOne({ email });
        if (emailExists) {
            return res.status(400).json({ error: 'Already exist' });
        }

        const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

        const newUser = {
            email,
            password: hashedPassword
        };

        await dbClient.db.collection('users').insertOne(newUser);

        return res.status(201).json({
            id: newUser._id,
            email: newUser.email
        });
    }


    static async getMe(req, res) {
	const token = req.headers['x-token'];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

	const userId = await redisClient.get(`auth_${token}`);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

	 const user = await dbClient.db.collection('users').findOne({ _id: dbClient.objectId(userId) });
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }


	  return res.status(200).json({ id: user._id, email: user.email });

    }
}

export default UsersController;
