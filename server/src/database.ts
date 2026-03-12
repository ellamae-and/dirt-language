import DatabaseConstructor, { Database as SQLiteDatabase } from "better-sqlite3";
import fs from "fs";
import path from "path";


/**
 * This class provides a reusable interface for interacting with a SQLite database.
 * It encapsulates the database connection and provides basic methods for:
 *  - Connecting to the database
 *  - Disconnecting from the database
 *  - Executing SQL commands
 */

export class Database {

    // Holds the active database connection
  // Initially null until Connect() is called
  private connection: SQLiteDatabase | null = null;

    // Stores the full file path to the database file
  private dbPath: string;


   /**
   * Initializes the database file path and ensures that the data
   * directory exists before attempting to connect to the database.
   */
  constructor(dbFileName: string = "dirt.db") {

        // Resolve the path to the "../data" directory relative to the project root
    const dataDir = path.resolve(process.cwd(), "../data");

        // If the data directory does not exist, create it
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

        // Build the full path to the database file
    this.dbPath = path.join(dataDir, dbFileName);
  }


    /**
   * Establishes a connection to the SQLite database.
   * If a connection already exists, it does nothing.
   */
  public Connect(): void {

       // Only create a connection if one does not already exist
    if (!this.connection) {
      this.connection = new DatabaseConstructor(this.dbPath);
    }
  }

  /**
   * Disconnects from the database.
   */
  public Disconnect(): void {
      // Only attempt to close if a connection exists
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }

  /**
   * Parameters:
   *  - sql: the SQL command to run
   *  - params: optional array of parameters for prepared statements
   * 
   * This method automatically determines whether the SQL command
   * is a SELECT query or a modification query.
   * 
   * SELECT queries return rows of data.
   * INSERT/UPDATE/DELETE return execution metadata.
   */
  public Execute(sql: string, params: unknown[] = []): unknown {

      // Ensure the database is connected before executing queries
    if (!this.connection) {
      throw new Error("Database not connected. Call Connect() first.");
    }

        // Determine the command type by inspecting the beginning of the SQL statement
    const command = sql.trim().toUpperCase();

        // If the query is a SELECT statement, return all rows
    if (command.startsWith("SELECT")) {
      return this.connection.prepare(sql).all(...params);
    }

        // Otherwise execute the query and return the result metadata
    // (used for INSERT, UPDATE, DELETE, etc.)

    return this.connection.prepare(sql).run(...params);
  }
}