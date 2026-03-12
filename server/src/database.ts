import DatabaseConstructor, { Database as SQLiteDatabase } from "better-sqlite3";
import fs from "fs";
import path from "path";

export class Database {
  private connection: SQLiteDatabase | null = null;
  private dbPath: string;

  constructor(dbFileName: string = "dirt.db") {
    const dataDir = path.resolve(process.cwd(), "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, dbFileName);
  }

  /**
   */
  public Connect(): void {
    if (!this.connection) {
      this.connection = new DatabaseConstructor(this.dbPath);
    }
  }

  /**
   * Disconnects from the database.
   */
  public Disconnect(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }

  /**
   * Executes an SQL statement using optional bound parameters.
   * Uses parameterized queries to reduce SQL injection risk.
   */
  public Execute(sql: string, params: unknown[] = []): unknown {
    if (!this.connection) {
      throw new Error("Database not connected. Call Connect() first.");
    }

    const command = sql.trim().toUpperCase();

    if (command.startsWith("SELECT")) {
      return this.connection.prepare(sql).all(...params);
    }

    return this.connection.prepare(sql).run(...params);
  }
}