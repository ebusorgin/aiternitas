import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4007;

app.use(express.json());
app.get('/', (req, res) => res.send('integrationServer is running on port ' + PORT));

app.listen(PORT, () => console.log('integrationServer listening on port ' + PORT));
