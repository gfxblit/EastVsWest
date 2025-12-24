/**
 * Debug Tools Initialization Tests
 * Tests for Eruda initialization following TDD workflow
 */

import { jest } from '@jest/globals';
import { initializeDebugTools } from './main.js';

// Mock eruda module
jest.unstable_mockModule('eruda', () => ({
  default: {
    init: jest.fn()
  }
}));

describe('initializeDebugTools', () => {
  let mockErudaModule;

  describe('Development Mode', () => {
    test('WhenDevModeEnabled_ShouldInitializeEruda', async () => {
      // Arrange
      const mockEnv = { DEV: true };
      const mockLocation = { search: '' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(true);
    });

    test('WhenDevModeDisabled_ShouldNotInitializeEruda', async () => {
      // Arrange
      const mockEnv = { DEV: false };
      const mockLocation = { search: '' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Debug URL Parameter', () => {
    test('WhenDebugParamTrue_ShouldInitializeEruda', async () => {
      // Arrange
      const mockEnv = { DEV: false };
      const mockLocation = { search: '?debug=true' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(true);
    });

    test('WhenDebugParamFalse_ShouldNotInitializeEruda', async () => {
      // Arrange
      const mockEnv = { DEV: false };
      const mockLocation = { search: '?debug=false' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(false);
    });

    test('WhenDebugParamMissing_ShouldNotInitializeEruda', async () => {
      // Arrange
      const mockEnv = { DEV: false };
      const mockLocation = { search: '?other=value' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(false);
    });

    test('WhenMultipleParams_ShouldDetectDebugParam', async () => {
      // Arrange
      const mockEnv = { DEV: false };
      const mockLocation = { search: '?foo=bar&debug=true&baz=qux' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Combined Conditions', () => {
    test('WhenDevModeAndDebugParam_ShouldInitializeEruda', async () => {
      // Arrange
      const mockEnv = { DEV: true };
      const mockLocation = { search: '?debug=true' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(true);
    });

    test('WhenNeitherDevNorDebugParam_ShouldNotInitializeEruda', async () => {
      // Arrange
      const mockEnv = { DEV: false };
      const mockLocation = { search: '' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Production Scenarios', () => {
    test('WhenProductionWithoutDebugParam_ShouldNotLoadEruda', async () => {
      // Arrange
      const mockEnv = { DEV: false, PROD: true };
      const mockLocation = { search: '' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(false);
    });

    test('WhenProductionWithDebugParam_ShouldLoadEruda', async () => {
      // Arrange
      const mockEnv = { DEV: false, PROD: true };
      const mockLocation = { search: '?debug=true' };

      // Act
      const result = await initializeDebugTools(mockEnv, mockLocation);

      // Assert
      expect(result).toBe(true);
    });
  });
});
