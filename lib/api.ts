import { DiagnoseRequest, DiagnoseResponse } from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function diagnose(request: DiagnoseRequest): Promise<DiagnoseResponse> {
  const response = await fetch(`${API_BASE_URL}/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || '診断に失敗しました');
  }

  return response.json();
}
