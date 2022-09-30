import { WithId, Document } from "mongodb";

export interface IUser extends WithId<Document> {
    tgId: number;
    activeState:
        | "REG_NICK"
        | "REG_TEXT"
        | "WAIT_ACCESS"
        | "ACTIVATED"
        | "BANNED"
        | "WAIT_ASK"
        | "WITHDRAW_ASK";
    lolzLink?: string;
    desc?: string;
    activateDate?: Date;
    balance?: number;
    withdrawMethod?: "qiwi" | "yoomoney" | "card" | "crypto";
    waitForAccount?: boolean;
}
