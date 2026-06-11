import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4006;

app.use(express.json());
app.get('/', (req, res) => res.send('sandboxServer is running on port ' + PORT));

app.listen(PORT, () => console.log('sandboxServer listening on port ' + PORT));
