// import { PrismaClient, Alarm as AlarmModel, Tag as TagModel } from "@prisma/client";
// import { EventEmitter } from "events";
// import { Server } from "socket.io";

// // ---------- Enums and Constants (similar to 1st code) ----------

// enum AlarmStatusEnum {
//   VOID = "",     // or "VOID" if you prefer
//   ON = "N",      // active
//   OFF = "NF",    // got triggered but is now inactive
//   ACK = "NA",    // triggered and acknowledged
// }

// enum AlarmsStatusEnum {
//   INIT = "init",
//   LOAD = "load",
//   IDLE = "idle",
// }

// enum AlarmsTypes {
//   HIGH_HIGH = "highhigh",
//   HIGH = "high",
//   LOW = "low",
//   INFO = "info",
//   ACTION = "action",
// }

// enum AlarmAckModeEnum {
//   FLOAT = "float",
//   ACK_ACTIVE = "ackactive",
//   ACK_PASSIVE = "ackpassive",
// }

// enum ActionsTypes {
//   POPUP = "popup",
//   SET_VALUE = "setValue",
//   SET_VIEW = "setView",
//   SEND_MSG = "sendMsg",
//   RUN_SCRIPT = "runScript",
// }

// // Bitmask time multiplier. Adjust as you see fit.
// const ALARMS_CHECK_INTERVAL_MS = 3000;
// const TIME_MULTIPLIER = 1000; // to interpret checkdelay & timedelay in seconds
// const ID_SEPARATOR = "^~^";

// // ---------- Prisma init ----------

// const prisma = new PrismaClient();

// // ---------- Alarm Class ----------
// // Merges logic from both codes.

// class Alarm {
//   public id: string;           // Primary key from DB
//   public name: string;         // Alarm "logical" name
//   public type: string;         // "highhigh", "high", "low", "info", "action"
//   public status: string;       // "N", "NF", "NA", "" ...
//   public subproperty: any;     // JSON with min, max, checkdelay, timedelay, ackmode, etc.
//   public tag: TagModel | null; // Full Tag object (from Prisma)
//   public isEnabled: boolean;   // Whether alarm is enabled
//   public ontime: number | null;
//   public offtime: number | null;
//   public acktime: number | null;
//   public lastcheck: number;
//   public toremove: boolean;
//   public userack?: string;

//   constructor(
//     dbAlarm: AlarmModel & { tag?: TagModel | null }
//   ) {
//     // Adapt how you fetch from the DB. This example assumes:
//     // - "dbAlarm" has fields: id, name, type, status, subproperty, isEnabled, ontime, offtime, acktime, tag, ...
//     this.id = dbAlarm.id;
//     this.name = dbAlarm.name || "";
//     this.type = dbAlarm.type|| "";
//     this.status = dbAlarm.status || AlarmStatusEnum.VOID;
//     // parse JSON fields if needed
//     this.subproperty = dbAlarm.subproperty ? JSON.parse(dbAlarm.subproperty) : {};
//     this.isEnabled = dbAlarm.isEnabled;
//     this.tag = dbAlarm.tag || null;

//     // Times
//     this.ontime = dbAlarm.ontime ? dbAlarm.ontime.getTime() : null;
//     this.offtime = dbAlarm.offtime ? dbAlarm.offtime.getTime() : null;
//     this.acktime = dbAlarm.acktime ? dbAlarm.acktime.getTime() : null;

//     // Internal
//     this.lastcheck = 0;
//     this.toremove = false;
//     this.userack = dbAlarm.userack || "";
//   }

//   /**
//    * Return ID in the style of "name^~^type".
//    */
//   getCompositeId(): string {
//     return `${this.name}${ID_SEPARATOR}${this.type}`;
//   }

//   /**
//    * Check if alarm requires acknowledgment
//    * - If ackmode = float => no ack needed => returns -1
//    * - If ackmode = ackpassive => ack needed when status=OFF => returns 1
//    * - If ackmode = ackactive => ack needed when status=OFF or ON => returns 1
//    * - Otherwise => 0
//    */
//   isToAck(): number {
//     const ackmode = this.subproperty.ackmode || AlarmAckModeEnum.FLOAT;
//     if (ackmode === AlarmAckModeEnum.FLOAT) {
//       return -1;
//     }
//     if (ackmode === AlarmAckModeEnum.ACK_PASSIVE && this.status === AlarmStatusEnum.OFF) {
//       return 1;
//     }
//     if (
//       ackmode === AlarmAckModeEnum.ACK_ACTIVE &&
//       (this.status === AlarmStatusEnum.OFF || this.status === AlarmStatusEnum.ON)
//     ) {
//       return 1;
//     }
//     return 0;
//   }

//   /**
//    * Acknowledge the alarm
//    */
//   setAck(username: string) {
//     if (!this.acktime) {
//       this.acktime = Date.now();
//       this.lastcheck = 0;
//       this.userack = username;
//       console.log(`[Ack] Alarm ${this.name} acknowledged by ${username}.`);
//     }
//   }

//   /**
//    * Reset alarm to default
//    */
//   init() {
//     this.toremove = false;
//     this.ontime = null;
//     this.offtime = null;
//     this.acktime = null;
//     this.status = AlarmStatusEnum.VOID;
//     this.lastcheck = 0;
//     this.userack = "";
//   }

//   /**
//    * The main logic to check if the alarm transitions between states.
//    */
//   async check(currentTime: number, tagValue: number | null | undefined): Promise<boolean> {
//     // Don’t check too frequently
//     const checkDelayMs = (this.subproperty.checkdelay || 0) * TIME_MULTIPLIER;
//     if (this.lastcheck + checkDelayMs > currentTime) {
//       return false;
//     }
//     this.lastcheck = currentTime;
//     this.toremove = false;

//     // If bitmask is present, convert tagValue
//     let finalValue = tagValue !== null && tagValue !== undefined ? tagValue : null;
//     if (this.tag?.bitmask) {
//       finalValue = (Number(finalValue) & this.tag.bitmask) ? 1 : 0;
//     }

//     // Check range
//     const minVal = this.subproperty.min ?? Number.MIN_SAFE_INTEGER;
//     const maxVal = this.subproperty.max ?? Number.MAX_SAFE_INTEGER;
//     const inRange =
//       finalValue !== null &&
//       finalValue !== undefined &&
//       finalValue >= minVal &&
//       finalValue <= maxVal;
//       console.log(`[DEBUG]  ${this.name} inRange=${inRange}, status=${this.status}, ontime=${this.ontime}, now=${currentTime}`);

//     switch (this.status) {
//       case AlarmStatusEnum.VOID:
//         if (!inRange) {
//           console.log(`[DEBUG]  ${this.name} inRange=${inRange}, status=${this.status}, ontime=${this.ontime}, now=${currentTime}`);

//           this.ontime = null;
//           return false;
//         } else if (!this.ontime) {
//           // Mark the first time we see it in range
//           this.ontime = currentTime;
//           return false;
//         }
//         // Check timedelay
//         const timeDelayMs = (this.subproperty.timedelay || 0) * TIME_MULTIPLIER;
//         if (this.ontime + timeDelayMs <= currentTime) {
//           this.status = AlarmStatusEnum.ON;
//           console.log(`[Alarm ON] ${this.name}`);
//           return true;
//         }
//         return false;



//       case AlarmStatusEnum.ON:
//         if (!inRange) {
//           this.status = AlarmStatusEnum.OFF;
//           if (!this.offtime) {
//             this.offtime = currentTime;
//           }
//           // If float or already acked => remove
//           if (
//             this.subproperty.ackmode === AlarmAckModeEnum.FLOAT ||
//             this.acktime
//           ) {
//             this.toremove = true;
//           }
//           console.log(`[Alarm OFF] ${this.name}`);
//           return true;
//         }
//         // If alarm is acked => move to ACK
//         if (this.acktime) {
//           this.status = AlarmStatusEnum.ACK;
//           console.log(`[Alarm ACK] ${this.name}`);
//           return true;
//         }
//         return false;

//       case AlarmStatusEnum.OFF:
//         if (inRange) {
//           // Reactivate
//           this.status = AlarmStatusEnum.ON;
//           this.acktime = null;
//           this.offtime = null;
//           this.ontime = currentTime;
//           this.userack = "";
//           console.log(`[Alarm RE-ON] ${this.name}`);
//           return true;
//         }
//         // If acked or an ACTION alarm => remove
//         if (this.acktime || this.type === AlarmsTypes.ACTION) {
//           this.toremove = true;
//           return true;
//         }
//         return false;

//       case AlarmStatusEnum.ACK:
//         if (!inRange) {
//           if (!this.offtime) {
//             this.offtime = currentTime;
//           }
//           // Go from ACK → ON if alarm is no longer in range
//           this.status = AlarmStatusEnum.ON;
//           console.log(`[Alarm ACK->ON] ${this.name}`);
//           return true;
//         }
//         return false;
//     }

//     return false;
//   }
// }


// // ---------- AlarmManager Class (merged) ----------

// class AlarmsManager {
//   private prisma: PrismaClient;
//   private events: EventEmitter;
//   private status: AlarmsStatusEnum;
//   private working: boolean;
//   private alarms: { [key: string]: Alarm[] }; // group by name or by composite ID
//   public clearAlarmsFlag: boolean;

//   constructor() {
//     this.prisma = prisma;
//     this.events = new EventEmitter();
//     this.status = AlarmsStatusEnum.INIT;
//     this.working = false;
//     this.alarms = {};
//     this.clearAlarmsFlag = false;
//   }

//   /**
//    * Start the manager’s interval
//    */
//   start(): void {
//     console.log("🚀 Alarm Manager Started.");
//     setInterval(() => this.checkStatus(), ALARMS_CHECK_INTERVAL_MS);
//   }

//   /**
//    * The main state machine
//    */
//   private async checkStatus(): Promise<void> {
//     // Avoid concurrency overlap
//     if (this.working) {
//       console.log("⚠️ Alarm Manager is already processing. Skipping...");
//       return;
//     }

//     this.working = true;
//     try {
//       switch (this.status) {
//         case AlarmsStatusEnum.INIT:
//           console.log("⏳ State: INIT => load DB => status=LOAD");
//           await this.initDB();         // optional init, e.g. migrations, etc.
//           this.status = AlarmsStatusEnum.LOAD;
//           break;

//         case AlarmsStatusEnum.LOAD:
//           console.log("⏳ State: LOAD => load properties & alarms => status=IDLE");
//           // Clear or load alarms
//           if (this.clearAlarmsFlag) {
//             await this.clearAlarms(); // or partial clear
//             this.clearAlarmsFlag = false;
//           }
//           await this.loadAlarmDefinitions(); // e.g. property from DB or from config
//           await this.loadPersistedAlarms();  // load DB alarm states
//           this.status = AlarmsStatusEnum.IDLE;
//           this.emitAlarmsChanged();
//           break;

//         case AlarmsStatusEnum.IDLE:
//           console.log("🔍 State: IDLE => process alarms");
//           const changed = await this.processAlarms();
//           if (changed) {
//             this.emitAlarmsChanged(true);
//           }
//           break;
//       }
//     } catch (error) {
//       console.error("❌ Error in checkStatus:", error);
//     } finally {
//       this.working = false;
//     }
//   }

  
//   /**
//    * Optional DB init
//    */
//   private async initDB(): Promise<void> {
//     console.log("📡 (Optional) DB init or migrations done here.");
//   }

//   /**
//    * Load the definitions for all alarms (like the 1st code `_loadProperty()`).
//    * For example, you might store the alarm "design" or "property" in a table.
//    */
//   private async loadAlarmDefinitions(): Promise<void> {
//     // In the original code, the alarm definitions were loaded from `runtime.project.getAlarms()`.
//     // Here, you might have them in a separate table (e.g. "alarmDefinition") or in the same "alarm" table.
//     // If you store them in the same table, you just skip this step. Or if you want a separate approach:
//     //   e.g. SELECT * FROM AlarmDefinitions => for each definition, create or update the alarm in DB
//     // For now, we won't do anything. You can adapt as needed.
//     console.log("📡 loadAlarmDefinitions => (stub) retrieve alarm property from config or DB...");
//     // TODO: Implementation depends on your app’s schema. 
//   }

//   /**
//    * Load the persisted alarms from DB to local memory, merging with any definitions
//    * (similar to `_loadAlarms()` in the 1st code).
//    */
//   private async loadPersistedAlarms(): Promise<void> {
//     console.log("📡 Loading alarms from DB...");
//     // Example: load all alarm rows with the Tag included
//     const alarmsFromDB = await this.prisma.alarm.findMany({
//       include: { tag: true },
//     });
//     console.log(`✅ Loaded ${alarmsFromDB.length} alarms from DB.`);

//     this.alarms = {};

//     for (const dbAlarm of alarmsFromDB) {
//       const alarm = new Alarm(dbAlarm);
//       if (!this.alarms[alarm.name]) {
//         this.alarms[alarm.name] = [];
//       }
//       this.alarms[alarm.name].push(alarm);
//     }
//   }
  
//   public addOrUpdateAlarmInMemory(dbAlarm: AlarmModel): void {
//     // 1) Convert the DB alarm to your local Alarm instance
//     //    Possibly re-fetch the Tag if needed or parse subproperty
//     const alarmObj = new Alarm({
//       ...dbAlarm,
//       // if you need the tag, you might do:
//       // tag: <some query or partial Tag object if needed>
//     });

//     // 2) Check if we already have an array for alarmObj.name
//     if (!this.alarms[alarmObj.name]) {
//       this.alarms[alarmObj.name] = [];
//     }

//     // 3) See if we have an existing alarm with the same .id
//     const existingIndex = this.alarms[alarmObj.name].findIndex(a => a.id === alarmObj.id);
//     if (existingIndex >= 0) {
//       // update in place
//       this.alarms[alarmObj.name][existingIndex] = alarmObj;
//       console.log(`🔄 Alarm ${alarmObj.id} updated in memory.`);
//     } else {
//       // add new
//       this.alarms[alarmObj.name].push(alarmObj);
//       console.log(`🆕 Alarm ${alarmObj.id} added in memory.`);
//     }
//   }

//   /**
//    * Called when an alarm is deleted in the DB.
//    * We remove it from the in-memory dictionary.
//    */
//   public removeAlarmInMemory(alarmId: string): void {
//     // Find which array it’s in
//     for (const nameKey in this.alarms) {
//       const idx = this.alarms[nameKey].findIndex(a => a.id === alarmId);
//       if (idx >= 0) {
//         this.alarms[nameKey].splice(idx, 1);
//         console.log(`❌ Alarm ${alarmId} removed from memory.`);
//         // If the array becomes empty, optionally delete the key
//         if (this.alarms[nameKey].length === 0) {
//           delete this.alarms[nameKey];
//         }
//         break; // done removing
//       }
//     }
//   }


//   public async updateAlarmsByTag(updatedTag: TagModel): Promise<void> {
//     for (const nameKey in this.alarms) {
//       const groupAlarms = this.alarms[nameKey];
//       for (let i = 0; i < groupAlarms.length; i++) {
//         const alarm = groupAlarms[i];
        
//         // 1) Check if this alarm uses the updated tag
//         if (alarm.tag && alarm.tag.id === updatedTag.id) {
//           // 2) Skip if alarm is not enabled
//           if (!alarm.isEnabled) {
//             console.log(`Alarm ${alarm.id} is disabled; skipping re-check for updated tag ${updatedTag.id}.`);
//             continue;
//           }
  
//           // 3) Update the alarm's tag reference
//           alarm.tag = updatedTag;
  
//           // 4) Re-check the alarm state using the updated tag value
//           const currentTime = Date.now();
//           const tagValue = parseFloat(updatedTag.value || "0");
//           const changed = await alarm.check(currentTime, tagValue);
          
//           // 5) If state changed, handle the alarm update & possible action
//           if (changed) {
//             await this.handleAlarmUpdate(alarm);
//             if (alarm.type === AlarmsTypes.ACTION && alarm.status === AlarmStatusEnum.ON) {
//               await this.handleAlarmAction(alarm);
//             }
//           }
//         }
//       }
//     }
//   }
  
  
  
//   // async processAlarms(): Promise<boolean> {
//   //   console.log("🔄 Checking alarms...");
//   //   let anyChange = false;
  
//   //   // Iterate over each group of alarms
//   //   for (const nameKey in this.alarms) {
//   //     // We'll store them in a local array reference to modify as needed
//   //     const groupAlarms = this.alarms[nameKey];
  
//   //     // Iterate backward so we can safely remove alarms by index
//   //     for (let i = groupAlarms.length - 1; i >= 0; i--) {
//   //       const alarm = groupAlarms[i];
  
//   //       if (!alarm.isEnabled) {
//   //         // If alarm not enabled, skip or optionally remove
//   //         continue;
//   //       }
  
//   //       // 1) Fetch the latest Tag value
//   //       let tagValue: number | null = null;
//   //       if (alarm.tag) {
//   //         const latestTag = await this.prisma.tag.findUnique({
//   //           where: { id: alarm.tag.id },
//   //         });
//   //         if (latestTag?.value !== undefined && latestTag.value !== null) {
//   //           tagValue = parseFloat(latestTag.value);
//   //         }
//   //       }
  
//   //       // 2) Check transitions
//   //       const currentTime = Date.now();
//   //       const changed = await alarm.check(currentTime, tagValue);
  
//   //       // 3) If changed => update in DB and handle actions
//   //       if (changed) {
//   //         anyChange = true;
//   //         // Update the alarm in DB with the new status/times
//   //         await this.handleAlarmUpdate(alarm);
  
//   //         // If it's an ACTION alarm turning ON => handle action
//   //         if (alarm.type === AlarmsTypes.ACTION && alarm.status === AlarmStatusEnum.ON) {
//   //           await this.handleAlarmAction(alarm);
//   //         }
  
//   //         // 4) If alarm is flagged to remove => DELETE from DB & remove from memory
//   //         if (alarm.toremove) {
//   //           // Remove from DB
//   //           await this.prisma.alarm.delete({ where: { id: alarm.id } });
            
//   //           // Remove from in-memory array
//   //           groupAlarms.splice(i, 1);
  
//   //           // Because we removed it from the array, no further processing needed
//   //           continue;
//   //         }
//   //       }
//   //     }
//   //   }
  
//   //   return anyChange;
//   // }
  
//   async processAlarms(): Promise<boolean> {
//     console.log("🔄 Checking alarms...");
//     let anyChange = false;
//     const currentTime = Date.now();
  
//     // Iterate over each group of alarms
//     for (const nameKey in this.alarms) {
//       const groupAlarms = this.alarms[nameKey];
//       for (let i = groupAlarms.length - 1; i >= 0; i--) {
//         const alarm = groupAlarms[i];
//         if (!alarm.isEnabled) continue;
//       // console.log(`Group: "${nameKey}" has ${groupAlarms.length} alarms.`);

//         // Use the tag value directly from alarm.tag (which should be up-to-date)
//         let tagValue: number | null = null;
//         if (alarm.tag && alarm.tag.value !== undefined && alarm.tag.value !== null) {
//           tagValue = parseFloat(alarm.tag.value);
//         }
  
//         const changed = await alarm.check(currentTime, tagValue);
  
//         if (changed) {
//           anyChange = true;
//           await this.handleAlarmUpdate(alarm);
//           if (alarm.type === AlarmsTypes.ACTION && alarm.status === AlarmStatusEnum.ON) {
//             await this.handleAlarmAction(alarm);
//           }
//           if (alarm.toremove) {
//             await this.prisma.alarm.delete({ where: { id: alarm.id } });
//             groupAlarms.splice(i, 1);
//             continue;
//           }
//         }
//       }
//     }
//     return anyChange;
//   }
  
  
//   private async handleAlarmUpdate(alarm: Alarm): Promise<void> {
//     // 1) Update alarm row in DB
//     await this.prisma.alarm.update({
//       where: { id: alarm.id },
//       data: {
//         status: alarm.status,
//         ontime: alarm.ontime ? new Date(alarm.ontime) : null,
//         offtime: alarm.offtime ? new Date(alarm.offtime) : null,
//         acktime: alarm.acktime ? new Date(alarm.acktime) : null,
//         userack: alarm.userack,
//         isEnabled: alarm.isEnabled,
//       },
//       include: { tag: true },

//     });
  
//     // 2) If you want a new row for each new ON cycle, you’ll typically do an upsert on (alarmId, ontime)
//     //    If your schema has:
//     //    @@unique([alarmId, ontime], name: "alarmId_ontime")
//     //    Then do something like:
  
//     const ontimeDate = alarm.ontime ? new Date(alarm.ontime) : null;
//     if (ontimeDate) {
//       await this.prisma.alarmHistory.upsert({
//         where: {
//           // This property name must match the one generated by Prisma.
//           // Possibly 'alarmId_ontime' or 'AlarmHistory_alarmId_ontime_key', etc.
//           alarmId_ontime: {
//             alarmId: alarm.id,
//             ontime: ontimeDate,
//           },
//         },
//         create: {
//           alarmId: alarm.id,
//           name: alarm.name,
//           type: alarm.type,
//           status: alarm.status,
//           text: alarm.subproperty?.text || "",
//           group: alarm.subproperty?.group || "",
//           ontime: ontimeDate,
//           offtime: alarm.offtime ? new Date(alarm.offtime) : null,
//           acktime: alarm.acktime ? new Date(alarm.acktime) : null,
//           userack: alarm.userack || null,
//         },
//         update: {
//           status: alarm.status,
//           offtime: alarm.offtime ? new Date(alarm.offtime) : null,
//           acktime: alarm.acktime ? new Date(alarm.acktime) : null,
//           userack: alarm.userack || null,
//         },
//       });
//     }
//   }
  
//   /**
//    * If the alarm is an ACTION type, handle the logic (similar to `_checkActions`).
//    */
//   private async handleAlarmAction(alarm: Alarm): Promise<void> {
//     if (!alarm.subproperty) return;
//     switch (alarm.subproperty.type) {
//       case ActionsTypes.SET_VALUE:
//         // TODO: Implement setValue logic
//         // e.g. find the target tag and update DB
//         console.log(`[Action] SET_VALUE param=${alarm.subproperty.actparam}`);
//         break;

//       case ActionsTypes.RUN_SCRIPT:
//         // TODO: Implement script logic
//         // e.g. your runtime.scriptsMgr.runScript(...) 
//         console.log(`[Action] RUN_SCRIPT param=${alarm.subproperty.actparam}`);
//         break;

//       case ActionsTypes.POPUP:
//       case ActionsTypes.SET_VIEW:
//       case ActionsTypes.SEND_MSG:
//         // UI-level or messaging-level actions
//         console.log(`[Action] ${alarm.subproperty.type} params=${alarm.subproperty.actparam}`);
//         break;
//     }
//   }

//   /**
//    * Emit event to signal that alarms changed
//    */
//   private emitAlarmsChanged(details?: boolean) {
//     this.events.emit("alarms-status:changed", { details });
//   }

//   /**
//    * Clear all alarms from DB (like `clearAlarms()` in 1st code).
//    */
//   async clearAlarms(all: boolean = true): Promise<void> {
//     // If "all" is true => remove all rows
//     // If partial => adapt logic
//     console.log("[ClearAlarms] Clearing all alarms from DB...");
//     await this.prisma.alarm.deleteMany({});
//     // Also empty local
//     this.alarms = {};
//   }

//   /**
//    * Flag for clearing alarms on next cycle
//    */
//   requestClearAlarms() {
//     this.clearAlarmsFlag = true;
//   }

//   /**
//    * Example of a retention check method:
//    */
//   async checkRetention(retentionLimitDate: Date): Promise<void> {
//     // e.g. delete old alarm history older than retentionLimitDate
//     // If you separate alarm "history" from "active" table, do that here
//     console.log(`[Retention] Deleting older than ${retentionLimitDate}`);
//     // TODO: Implement with your schema: 
//     // await this.prisma.alarmHistory.deleteMany({
//     //   where: { ontime: { lt: retentionLimitDate } }
//     // });
//   }

//   // ---------- Additional Methods from 1st code (adapted) ----------

//   /**
//    * Return a quick status: how many are ON for each type, etc.
//    */
//   async getAlarmsStatus() {
//     const result = { highhigh: 0, high: 0, low: 0, info: 0, actions: [] as any[] };
//     for (const nameKey in this.alarms) {
//       for (const alarm of this.alarms[nameKey]) {
//         if (alarm.status === AlarmStatusEnum.ON) {
//           switch (alarm.type) {
//             case AlarmsTypes.HIGH_HIGH:
//               result.highhigh++;
//               break;
//             case AlarmsTypes.HIGH:
//               result.high++;
//               break;
//             case AlarmsTypes.LOW:
//               result.low++;
//               break;
//             case AlarmsTypes.INFO:
//               result.info++;
//               break;
//             case AlarmsTypes.ACTION:
//               // If you want to handle actions that are "active"
//               result.actions.push(alarm.name);
//               break;
//           }
//         }
//       }
//     }
//     return result;
//   }

//   /**
//    * Return current active alarms. Also includes permission or filtering logic if you want.
//    */
//   getAlarmsValues() {
//     const activeAlarms: any[] = [];
//     console.log (`[Alarms] activeAlarms=${activeAlarms.length}`);

//     for (const nameKey in this.alarms) {
//       for (const alarm of this.alarms[nameKey]) {
//         if (alarm.status === AlarmStatusEnum.ON) {
//           activeAlarms.push({
//             id: alarm.id,
//             name: alarm.name,
//             type: alarm.type,
//             status: alarm.status,
//             ontime: alarm.ontime,
//             toAck: alarm.isToAck(),
//           });
//         }
//       }
//     }
//     return activeAlarms;
//   }

//   /**
//    * Acknowledge an alarm by ID or name^~^type
//    */
//  // alarmManager.ts

// async setAlarmAck(alarmId:string, username:string): Promise<boolean> {
//   let changed = false;

//   // In the manager, you presumably have something like:
//   //   this.alarms = { [key: string]: Alarm[] };
//   // So loop them all:
//   for (const nameKey in this.alarms) {
//     for (const alarm of this.alarms[nameKey]) {
//       // Compare the in-memory alarm.id to the alarmId you passed in
//       if (alarm.id === alarmId) {
//         // Check if alarm even needs ACK
//         if (alarm.isToAck() > 0) {
//           // Acknowledge
//           alarm.setAck(username);
//           // Update DB or any other side effect
//           await this.handleAlarmUpdate(alarm);
//           changed = true;
//         }
//       }
//     }
//   }
//   return changed;
// }


//   /**
//    * Return alarms history (requires you to have a dedicated alarm history table).
//    * You can store every status change or do it differently.
//    */
//   async getAlarmsHistory(start: Date, end: Date) {
//     // Example if you have an alarmHistory table
//     console.log(`[History] fetching from ${start} to ${end}`);
//     // TODO: adapt to your schema:
//     // return this.prisma.alarmHistory.findMany({
//     //   where: {
//     //     ontime: {
//     //       gte: start,
//     //       lte: end,
//     //     }
//     //   }
//     // });
//     return [];
//   }

//   // ---------- Optionally expose the events or have getters ----------

//   on(event: string, handler: (...args: any[]) => void) {
//     this.events.on(event, handler);
//   }

//   off(event: string, handler: (...args: any[]) => void) {
//     this.events.off(event, handler);
//   }
// }

// // ---------- Export an instance ----------
// // Or you can export the class and instantiate in your server.ts

// const alarmManager = new AlarmsManager();

// export default alarmManager;
