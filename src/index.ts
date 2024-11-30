import express, { Request, Response, Application } from 'express';

const app: Application = express();
const port = process.env.PORT || 8765;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello from Bun + Express!' });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});