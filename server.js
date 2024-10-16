import express from 'express';
const app = express();

const port =process.env.PORT || 5000;

app.use(express.json());

app.listen(port || 5000, () => {
    console.log(`Server running on port ${port}`)
})

export default app;