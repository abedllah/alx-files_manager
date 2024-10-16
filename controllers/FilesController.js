import fs from 'fs';
import { promisify } from 'util';
import path from 'path';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis.js';
import dbClient from '../utils/db.js';
import mime from 'mime-types';


const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const statAsync = promisify(fs.stat);
const readFileAsync = promisify(fs.readFile);

class FilesController {
    static async postUpload(req, res) {
        const token = req.headers['x-token'];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { name, type, parentId = 0, isPublic = false, data } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Missing name' });
        }

        const allowedTypes = ['folder', 'file', 'image'];
        if (!type || !allowedTypes.includes(type)) {
            return res.status(400).json({ error: 'Missing type' });
        }

        if (type !== 'folder' && !data) {
            return res.status(400).json({ error: 'Missing data' });
        }

        let parent = null;
        if (parentId !== 0) {
            parent = await dbClient.db.collection('files').findOne({ _id: dbClient.objectId(parentId) });
            if (!parent) {
                return res.status(400).json({ error: 'Parent not found' });
            }
            if (parent.type !== 'folder') {
                return res.status(400).json({ error: 'Parent is not a folder' });
            }
        }

        const fileDoc = {
            userId,
            name,
            type,
            isPublic,
            parentId,
            createdAt: new Date(),
        };


        if (type === 'folder') {
            const newFile = await dbClient.db.collection('files').insertOne(fileDoc);
            return res.status(201).json({ id: newFile.insertedId, ...fileDoc });
        }


        const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
        try {
            await statAsync(folderPath);
        } catch (err) {
            await mkdirAsync(folderPath, { recursive: true });
        }

        const fileUUID = uuidv4();
        const filePath = path.join(folderPath, fileUUID);

        try {
            const fileData = Buffer.from(data, 'base64');
            await writeFileAsync(filePath, fileData);

            fileDoc.localPath = filePath;
            const newFile = await dbClient.db.collection('files').insertOne(fileDoc);
            return res.status(201).json({ id: newFile.insertedId, ...fileDoc });
        } catch (err) {
            return res.status(500).json({ error: 'Error saving the file' });
        }
    }

    static async getShow(req, res) {
        const token = req.headers['x-token'];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const fileId = req.params.id;
        if (!ObjectId.isValid(fileId)) {
            return res.status(404).json({ error: 'Not found' });
        }

        const file = await dbClient.db.collection('files').findOne({
            _id: new ObjectId(fileId),
            userId
        });

        if (!file) {
            return res.status(404).json({ error: 'Not found' });
        }

        return res.status(200).json(file);
    }


    static async getIndex(req, res) {
        const token = req.headers['x-token'];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const parentId = req.query.parentId || 0;
        const page = parseInt(req.query.page, 10) || 0;
        const pageSize = 20;

        const pipeline = [
            { $match: { userId, parentId: parentId === 0 ? 0 : new ObjectId(parentId) } },
            { $skip: page * pageSize },
            { $limit: pageSize }
        ];

        try {
            const files = await dbClient.db.collection('files').aggregate(pipeline).toArray();
            return res.status(200).json(files);
        } catch (error) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }


    static async putPublish(req, res) {
        const token = req.headers['x-token'];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const fileId = req.params.id;
        if (!ObjectId.isValid(fileId)) {
            return res.status(404).json({ error: 'Not found' });
        }

        const file = await dbClient.db.collection('files').findOne({
            _id: new ObjectId(fileId),
            userId
        });

        if (!file) {
            return res.status(404).json({ error: 'Not found' });
        }

        await dbClient.db.collection('files').updateOne(
            { _id: new ObjectId(fileId), userId },
            { $set: { isPublic: true } }
        );

        const updatedFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId });

        return res.status(200).json(updatedFile);
    }


     static async putUnpublish(req, res) {
        const token = req.headers['x-token'];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const fileId = req.params.id;
        if (!ObjectId.isValid(fileId)) {
            return res.status(404).json({ error: 'Not found' });
        }

        const file = await dbClient.db.collection('files').findOne({
            _id: new ObjectId(fileId),
            userId
        });

        if (!file) {
            return res.status(404).json({ error: 'Not found' });
        }

        await dbClient.db.collection('files').updateOne(
            { _id: new ObjectId(fileId), userId },
            { $set: { isPublic: false } }
        );

        const updatedFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId });

        return res.status(200).json(updatedFile);
    }


    static async getFile(req, res) {
        const token = req.headers['x-token'] || null;
        const fileId = req.params.id;


        if (!ObjectId.isValid(fileId)) {
            return res.status(404).json({ error: 'Not found' });
        }

        const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });


        if (!file) {
            return res.status(404).json({ error: 'Not found' });
        }


        if (file.type === 'folder') {
            return res.status(400).json({ error: "A folder doesn't have content" });
        }


        let userId = null;
        if (token) {
            userId = await redisClient.get(`auth_${token}`);
        }
        if (!file.isPublic && (!userId || file.userId !== userId)) {
            return res.status(404).json({ error: 'Not found' });
        }


        if (!fs.existsSync(file.localPath)) {
            return res.status(404).json({ error: 'Not found' });
        }

        try {
            const fileContent = await readFileAsync(file.localPath);
            const mimeType = mime.lookup(file.name) || 'application/octet-stream';

            res.setHeader('Content-Type', mimeType);
            return res.send(fileContent);
        } catch (err) {
            return res.status(500).json({ error: 'Error reading the file' });
        }
    }
}

export default FilesController;
