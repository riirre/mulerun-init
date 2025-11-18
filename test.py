import json
import hmac
import hashlib
import uuid
from datetime import datetime, timezone

import requests

# ========== 配置区：按需替换 ==========
BASE_URL = "https://proclab.pages.dev/api/session"
METERING_ENDPOINT = "https://api.mulerun.com/sessions/metering"

USER_ID = "eddab2dad1bb62df84cdb9636136c39cdd6b009a989dae39922601f8557fcd50"
SESSION_ID = "623bbe18-02e4-4854-8398-7af409eaf1d0"
AGENT_ID = "d0f37f3e-6e74-4b39-a683-80fe3fe2744e"
ORIGIN = "mulerun.com"
NONCE = str(uuid.uuid4())

AGENT_KEY = "ak_wh9kId9mRmqpN_Ads1cIvQAAAZn2zgf6r1A12iecR5Cqp7gx0OpptdDzfz5udEs5poOA_j_idE4rsBt_DG1kRxh7Yzc1cnxQ"
MULERUN_API_TOKEN = "mck-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# ====================================


def compute_signature():
    request_time = str(int(datetime.now(timezone.utc).timestamp()))
    payload = {
        "agentId": AGENT_ID,
        "nonce": NONCE,
        "origin": ORIGIN,
        "sessionId": SESSION_ID,
        "time": request_time,
        "userId": USER_ID,
    }
    canonical = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    signature = hmac.new(AGENT_KEY.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return canonical, signature, request_time


def verify_session():
    canonical, signature, request_time = compute_signature()

    print("=== Canonical payload ===")
    print(canonical)
    print("=== Signature ===")
    print(signature)
    print()

    params = {
        "userId": USER_ID,
        "sessionId": SESSION_ID,
        "agentId": AGENT_ID,
        "time": request_time,
        "origin": ORIGIN,
        "nonce": NONCE,
        "signature": signature,
        "debug": "1",
    }

    response = requests.get(BASE_URL, params=params, timeout=15)
    print("[Verify Session] Status:", response.status_code)
    try:
        print(json.dumps(response.json(), ensure_ascii=False, indent=2))
    except ValueError:
        print(response.text)


def send_metering(cost: int, is_final: bool = False):
    payload = {
        "agentId": AGENT_ID,
        "sessionId": SESSION_ID,
        "cost": cost,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "isFinal": is_final,
        "meteringId": str(uuid.uuid4()),
    }

    response = requests.post(
        METERING_ENDPOINT,
        headers={
            "Authorization": f"Bearer {MULERUN_API_TOKEN}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=15,
    )

    print("[Metering] Status:", response.status_code)
    try:
        print(json.dumps(response.json(), ensure_ascii=False, indent=2))
    except ValueError:
        print(response.text)


if __name__ == "__main__":
    verify_session()
    # send_metering(cost=1050, is_final=False)
