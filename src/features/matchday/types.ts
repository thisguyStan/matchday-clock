import type { MatchClockState, MatchSettings } from "../../utils/match-clock";
import type {
  MessageKey,
  MessageParameters,
  UserPreferences,
} from "../../utils/i18n";

export interface MatchConfiguration {
  halfLengthMinutes: number;
  hasExtraTime: boolean;
  extraTimeLengthMinutes: number;
}

export interface MatchPreset extends MatchConfiguration {
  id: string;
  name: string;
}

export type PresetDraft = Omit<MatchPreset, "id"> & { id: string | null };

export interface LocalizedMessage {
  key: MessageKey;
  parameters?: MessageParameters;
}

export type ActiveModal =
  | "settings"
  | "setup"
  | "presetPicker"
  | "presetEditor"
  | "correction"
  | "about"
  | "installHelp"
  | "confirmation";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface PersistedMatchdayState {
  settings: MatchSettings;
  match: MatchClockState;
  preferences: UserPreferences;
  presets: MatchPreset[];
  hasMatch: boolean;
  pauseClockEnabled: boolean;
  notice: MessageKey | null;
}
