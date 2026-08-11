use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{Connection, OpenFlags, Transaction};

use crate::domain::error::AppError;

const INITIAL_MIGRATION: &str = include_str!("../../migrations/0001_initial.sql");

#[derive(Debug)]
pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        let connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
        )?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")?;

        let database = Self {
            connection: Mutex::new(connection),
        };
        database.apply_migrations()?;
        Ok(database)
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, AppError> {
        self.connection.lock().map_err(|_| AppError::PoisonedLock)
    }

    fn apply_migrations(&self) -> Result<(), AppError> {
        if self.user_version()? < 1 {
            self.lock()?.execute_batch(INITIAL_MIGRATION)?;
        }
        Ok(())
    }

    pub fn with_write<T>(
        &self,
        operation: impl FnOnce(&Transaction<'_>) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let value = operation(&transaction)?;
        transaction.commit()?;
        Ok(value)
    }

    pub fn user_version(&self) -> Result<i64, AppError> {
        self.query_i64("PRAGMA user_version")
    }

    pub fn query_i64(&self, sql: &str) -> Result<i64, AppError> {
        Ok(self.lock()?.query_row(sql, [], |row| row.get(0))?)
    }

    pub fn query_text(&self, sql: &str) -> Result<String, AppError> {
        Ok(self.lock()?.query_row(sql, [], |row| row.get(0))?)
    }
}
