import Dexie from 'dexie';

export const db = new Dexie('HypertrophyTrainerDB');

// Define database tables and index fields
db.version(1).stores({
  exercises: 'id, name, muscleGroup, exerciseType',
  history: 'id, timestamp',
  preferences: 'key' // key-value table for preferences
});

// Seed default exercises when database is created for the first time
db.on('populate', () => {
  db.exercises.bulkAdd([
    {
      id: 'db-shoulder-press',
      name: 'Dumbbell Shoulder Press',
      targetSets: 4,
      minReps: 10,
      maxReps: 12,
      isCustom: false,
      muscleGroup: 'Shoulders',
      exerciseType: 'compound',
      restDuration: 120
    },
    {
      id: 'lateral-raises',
      name: 'Lateral Raises',
      targetSets: 4,
      minReps: 12,
      maxReps: 15,
      isCustom: false,
      muscleGroup: 'Shoulders',
      exerciseType: 'isolation',
      restDuration: 90
    },
    {
      id: 'db-chest-press',
      name: 'Dumbbell Chest Press',
      targetSets: 4,
      minReps: 10,
      maxReps: 12,
      isCustom: false,
      muscleGroup: 'Chest',
      exerciseType: 'compound',
      restDuration: 120
    }
  ]);

  db.preferences.add({ key: 'prefLoggingMode', value: 'RPE' });
});
