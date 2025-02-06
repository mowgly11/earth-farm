import schema from "./schema.ts";
import type { User } from "../types/database_types.ts";

class DatabaseMethods {
    async findUser(id: string): Promise<Document | null> {
        try {
            const user: Document | null = await schema.findOne({id});
            if(!user) return null;
            else return user;
        } catch(err) {
            console.error(err);
            return null;
        }
    }

    async createUser(id: string, username: string): Promise<any> {
        try {
            const createUser = await schema.create({
                id,
                username
            });
    
            await createUser.save();

            return createUser;
        } catch(err) {
            return null;
        }
    }
}

export default new DatabaseMethods();