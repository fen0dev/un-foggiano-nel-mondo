/**
 * Script di backup manuale
 * Da eseguire con: npm run db:backup
 */

const { getDatabase } = require('./index');

console.log('Avvio backup database...');

try {
    const db = getDatabase();
    const backupPath = db.backup();
    
    console.log('\n📊 Statistiche database:');
    console.log(JSON.stringify(db.getStats(), null, 2));
    
    console.log('\n✅ Backup completato con successo!');
    console.log('File:', backupPath);
    
    process.exit(0);
} catch (error) {
    console.error('❌ Errore durante il backup:', error);
    process.exit(1);
}