/**
 * @jest-environment node
 *
 * Game Session API Tests
 * Tests for creating and managing game sessions using Supabase REST API
 */

import { randomUUID } from 'node:crypto';
import { GameSessionAPI } from './gameSession.js';

describe('GameSessionAPI', () => {
  let api;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  beforeEach(() => {
    // Verify environment variables are set
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables must be set');
    }

    api = new GameSessionAPI(SUPABASE_URL, SUPABASE_KEY);
  });

  describe('createGameSession', () => {
    test('WhenCreatingSession_ShouldReturnSessionWithId', async () => {
      // Arrange
      const hostId = randomUUID();
      const joinCode = 'ABC123';

      // Act
      const session = await api.createGameSession(hostId, joinCode);

      // Assert
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe('string');
      expect(session.join_code).toBe(joinCode);
      expect(session.host_id).toBe(hostId);
    });

    test('WhenCreatingSession_ShouldHaveDefaultStatus', async () => {
      // Arrange
      const hostId = randomUUID();
      const joinCode = 'DEF456';

      // Act
      const session = await api.createGameSession(hostId, joinCode);

      // Assert
      expect(session.status).toBe('lobby');
      expect(session.game_phase).toBe('lobby');
    });

    test('WhenCreatingSession_ShouldHaveDefaultPlayerCount', async () => {
      // Arrange
      const hostId = randomUUID();
      const joinCode = 'GHI789';

      // Act
      const session = await api.createGameSession(hostId, joinCode);

      // Assert
      expect(session.max_players).toBe(12);
      expect(session.current_player_count).toBe(1);
    });

    test('WhenCreatingSession_ShouldHaveTimestamps', async () => {
      // Arrange
      const hostId = randomUUID();
      const joinCode = 'JKL012';

      // Act
      const session = await api.createGameSession(hostId, joinCode);

      // Assert
      expect(session.created_at).toBeDefined();
      expect(session.expires_at).toBeDefined();

      // Verify expires_at is approximately 2 hours after created_at
      const createdDate = new Date(session.created_at);
      const expiresDate = new Date(session.expires_at);
      const diffHours = (expiresDate - createdDate) / (1000 * 60 * 60);
      expect(diffHours).toBeGreaterThan(1.9);
      expect(diffHours).toBeLessThan(2.1);
    });

    test('WhenCreatingSessionWithDuplicateJoinCode_ShouldThrowError', async () => {
      // Arrange
      const hostId1 = randomUUID();
      const hostId2 = randomUUID();
      const joinCode = 'MNO345';

      // Act & Assert
      await api.createGameSession(hostId1, joinCode);
      await expect(api.createGameSession(hostId2, joinCode)).rejects.toThrow();
    });
  });

  describe('getGameSession', () => {
    test('WhenGettingSessionByJoinCode_ShouldReturnSession', async () => {
      // Arrange
      const hostId = randomUUID();
      const joinCode = 'PQR678';
      const createdSession = await api.createGameSession(hostId, joinCode);

      // Act
      const retrievedSession = await api.getGameSession(joinCode);

      // Assert
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession.id).toBe(createdSession.id);
      expect(retrievedSession.join_code).toBe(joinCode);
      expect(retrievedSession.host_id).toBe(hostId);
    });

    test('WhenGettingNonExistentSession_ShouldReturnNull', async () => {
      // Arrange
      const joinCode = 'XYZ999';

      // Act
      const session = await api.getGameSession(joinCode);

      // Assert
      expect(session).toBeNull();
    });
  });

  describe('updateGameSession', () => {
    test('WhenUpdatingSessionStatus_ShouldPersistChanges', async () => {
      // Arrange
      const hostId = randomUUID();
      const joinCode = 'STU901';
      const createdSession = await api.createGameSession(hostId, joinCode);

      // Act
      const updatedSession = await api.updateGameSession(createdSession.id, {
        status: 'active',
        started_at: new Date().toISOString()
      });

      // Assert
      expect(updatedSession.status).toBe('active');
      expect(updatedSession.started_at).toBeDefined();
    });

    test('WhenUpdatingConflictZone_ShouldPersistCoordinates', async () => {
      // Arrange
      const hostId = randomUUID();
      const joinCode = 'VWX234';
      const createdSession = await api.createGameSession(hostId, joinCode);

      // Act
      const updatedSession = await api.updateGameSession(createdSession.id, {
        conflict_zone_center_x: 500.5,
        conflict_zone_center_y: 400.25,
        conflict_zone_radius: 600
      });

      // Assert
      expect(updatedSession.conflict_zone_center_x).toBe(500.5);
      expect(updatedSession.conflict_zone_center_y).toBe(400.25);
      expect(updatedSession.conflict_zone_radius).toBe(600);
    });
  });

  describe('deleteGameSession', () => {
    test('WhenDeletingSession_ShouldRemoveFromDatabase', async () => {
      // Arrange
      const hostId = randomUUID();
      const joinCode = 'YZA567';
      const createdSession = await api.createGameSession(hostId, joinCode);

      // Act
      await api.deleteGameSession(createdSession.id);
      const retrievedSession = await api.getGameSession(joinCode);

      // Assert
      expect(retrievedSession).toBeNull();
    });
  });
});
