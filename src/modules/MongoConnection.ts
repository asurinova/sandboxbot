import { Db, MongoClient } from "mongodb";

class MongoConnection {
    private client: MongoClient | undefined;

    constructor(url: string) {
        MongoClient.connect(url).then((client) => {
            this.client = client;
        });
    }

    db(dbName: string): Db | undefined {
        return this.client?.db(dbName);
    }
}

export default MongoConnection;
