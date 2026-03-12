import { Database } from "./database.js";

type ProgramRow = {
  id: number;
  name: string;
  code: string;
  created_at: string;
};

export class Program {
  public id: number | null;
  public name: string;
  public code: string;
  public createdAt: string | null;

  constructor(name: string = "", code: string = "", id: number | null = null) {
    this.id = id;
    this.name = name;
    this.code = code;
    this.createdAt = null;
  }

  /**
   * Inserts a new record if this.id is null,
   * otherwise updates the existing record.
   */
  public Save(db: Database): void {
    if (this.id === null) {
      const result = db.Execute(
        `
        INSERT INTO programs (name, code)
        VALUES (?, ?)
        `,
        [this.name, this.code]
      ) as { lastInsertRowid?: number | bigint };

      if (result.lastInsertRowid !== undefined) {
        this.id = Number(result.lastInsertRowid);
      }
    } else {
      db.Execute(
        `
        UPDATE programs
        SET name = ?, code = ?
        WHERE id = ?
        `,
        [this.name, this.code, this.id]
      );
    }
  }

  /**
   * Loads a record by primary key id.
   */
  public Load(db: Database, id: number): boolean {
    const rows = db.Execute(
      `
      SELECT id, name, code, created_at
      FROM programs
      WHERE id = ?
      `,
      [id]
    ) as ProgramRow[];

    if (rows.length === 0) {
      return false;
    }

    const row = rows[0];
    this.id = row.id;
    this.name = row.name;
    this.code = row.code;
    this.createdAt = row.created_at;

    return true;
  }

  /**
   * Deletes a record by primary key id.
   */
  public Delete(db: Database, id: number): void {
    db.Execute(
      `
      DELETE FROM programs
      WHERE id = ?
      `,
      [id]
    );

    if (this.id === id) {
      this.id = null;
      this.name = "";
      this.code = "";
      this.createdAt = null;
    }
  }

  /**
   * Returns all saved programs for the IDE dropdown.
   */
  public static ListAll(db: Database): ProgramRow[] {
    return db.Execute(
      `
      SELECT id, name, code, created_at
      FROM programs
      ORDER BY name ASC
      `
    ) as ProgramRow[];
  }
}