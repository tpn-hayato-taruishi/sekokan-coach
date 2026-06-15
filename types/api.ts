// API型定義（フロント ↔ バックエンド共通）

// === リクエスト ===
export type MonitoringTarget = 'workers' | 'products' | 'machines' | 'inventory';
export type CurrentSymptom = 'humidity' | 'heat_buildup' | 'liquid_leak' | 'electrical_anomaly' | 'abnormal_sound' | 'poor_ventilation';
export type CleanlinessLevel = 'ultra_precision' | 'hygiene_first' | 'general_manufacturing' | 'storage';

export interface DiagnoseRequest {
  monitoring_target: MonitoringTarget;
  current_symptom: CurrentSymptom;
  cleanliness_level: CleanlinessLevel;
  floor_area_sqm: number;
  room_partitions: number;
  ceiling_height_m?: number;
  heat_sources_count?: number;
  worker_count?: number;
}

// === レスポンス ===
export interface RecommendedSensor {
  type: string;
  label: string;
  count: number;
  reason: string;
}

export interface LossBreakdownItem {
  item: string;
  amount_yen: number;
}

export interface RiskPrediction {
  risk_title: string;
  risk_story: string;
  estimated_annual_loss_yen: number;
  loss_breakdown: LossBreakdownItem[];
}

export interface DiagnoseResponse {
  character_speech: string;
  recommended_sensors: RecommendedSensor[];
  total_sensor_count: number;
  estimated_cost_yen: number;
  risk_prediction: RiskPrediction;
  e_platch_benefit: string;
}

export interface ErrorResponse {
  error: true;
  message: string;
  code: string;
}

// === 選択肢のラベル定義 ===
export const MONITORING_TARGET_OPTIONS: { value: MonitoringTarget; label: string; icon: string; description: string }[] = [
  { value: 'workers', label: '現場の作業員', icon: '👷', description: '熱中症リスク、CO2上昇、労働環境の悪化' },
  { value: 'products', label: '製品・原材料', icon: '📦', description: '結露・カビ、液漏れによる品質劣化' },
  { value: 'machines', label: '製造機械・設備', icon: '⚙️', description: '制御盤の過熱、異常音、配電盤の電流異常' },
  { value: 'inventory', label: '保管・倉庫の在庫', icon: '🏭', description: '温湿度変化による品質劣化、照度不足' },
];

export const CURRENT_SYMPTOM_OPTIONS: { value: CurrentSymptom; label: string; icon: string; description: string }[] = [
  { value: 'humidity', label: '湿度・結露・カビの懸念', icon: '💧', description: '温湿度の管理不足による品質リスク' },
  { value: 'heat_buildup', label: '熱気の籠り・過熱', icon: '🔥', description: '制御盤の過熱、設備のオーバーヒート' },
  { value: 'liquid_leak', label: '配管からの液漏れ（油・薬品）', icon: '🚰', description: '油や薬品の漏出による設備損傷・事故' },
  { value: 'electrical_anomaly', label: '配電盤の電流異常', icon: '⚡', description: '電流値の異常による火災・停止リスク' },
  { value: 'abnormal_sound', label: '設備の異常音・振動', icon: '🔊', description: '故障の予兆、突発停止のリスク' },
  { value: 'poor_ventilation', label: '換気不良・空気の淀み', icon: '🌫️', description: 'CO2上昇による集中力低下・事故リスク' },
];

export const CLEANLINESS_LEVEL_OPTIONS: { value: CleanlinessLevel; label: string; icon: string; description: string }[] = [
  { value: 'ultra_precision', label: '超精密', icon: '🔬', description: '半導体、精密測定室' },
  { value: 'hygiene_first', label: '衛生第一', icon: '🧼', description: '食品、薬品、印刷' },
  { value: 'general_manufacturing', label: '一般製造', icon: '🔧', description: '組み立て、金属切削' },
  { value: 'storage', label: '保管メイン', icon: '📋', description: '物流倉庫、資材置き場' },
];

export const FLOOR_AREA_OPTIONS: { value: number; label: string }[] = [
  { value: 100, label: '〜100㎡（小規模）' },
  { value: 300, label: '100〜300㎡（中規模）' },
  { value: 500, label: '300〜500㎡（大規模）' },
  { value: 1000, label: '500㎡以上（超大規模）' },
];

export const ROOM_PARTITION_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1つ（大部屋）' },
  { value: 2, label: '2〜3室' },
  { value: 4, label: '4室以上' },
];
