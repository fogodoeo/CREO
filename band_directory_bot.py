"""Isolated BAND approval worker. Durable member records live on the main service."""
from __future__ import annotations

import copy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import threading
import time
import urllib.request

import band_join_monitor as base

ROOT = Path(__file__).resolve().parent
BAND_NO = "104432443"


def phone_from_text(text: str, allow_short=True) -> str:
    # Full mobile numbers are valid even when attached to a Korean profile name.
    values = set()
    words = str.maketrans("공영일이삼사오육칠팔구", "00123456789")
    normalized = str(text or "").translate(words)
    for match in re.finditer(r"(?<!\d)(?:010|\+?82[ .-]*10)[ .()-]*\d{4}[ .()-]*\d{4}(?!\d)", normalized):
        value = re.sub(r"\D", "", match.group())
        if value.startswith("82"):
            value = "0" + value[2:]
        values.add(value)
    if not values and allow_short:
        for match in re.finditer(r"(?<![\dA-Za-z가-힣])\d{4}[ .-]*\d{4}(?!\d)", normalized):
            values.add("010" + re.sub(r"\D", "", match.group()))
    return next(iter(values)) if len(values) == 1 else ""


def member_record(item: dict, *, existing=False, now=None) -> dict:
    name = str(item.get("name") or item.get("applicant_name") or "")
    sources = {"profile": {"text": (name + "\n" + str(item.get("description") or "")).strip()}}
    if "join_answer" in item:
        sources["answer"] = {"text": str(item.get("join_answer") or "")}
    # These are the exact fields used by BAND's applicant screen. A badge alone
    # or a masked post-approval number is never promoted to a full contact.
    cellphone = str(item.get("cellphone") or "")
    if item.get("cellphone_verified") is True and re.fullmatch(r"[+\d .()-]+", cellphone):
        if len(re.sub(r"\D", "", cellphone)) >= 11:
            sources["verified"] = {"text": cellphone, "verified": True}
    return {"bandNo": BAND_NO, "memberKey": str(item.get("member_key") or ""),
            "userNo": str(item.get("user_no") or ""), "displayName": name,
            "observedAt": now or int(time.time() * 1000),
            "status": "existing" if existing else "pending", "sources": sources}


def eligible(record: dict) -> bool:
    sources = record.get("sources", {})
    return any(phone_from_text(sources.get(source, {}).get("text", ""), allow_short=source == "profile")
               for source in ("profile", "answer", "verified"))


class DirectoryClient:
    def __init__(self):
        self.origin = os.environ.get("BAND_DIRECTORY_ORIGIN", "").rstrip("/")
        self.token = os.environ.get("BAND_DIRECTORY_BOT_TOKEN", "")
        if not self.origin.startswith("https://") or len(self.token) < 32:
            raise ValueError("directory_credentials_required")

    def call(self, operation, data=None):
        request = urllib.request.Request(
            self.origin + "/api/band-directory/bot/" + operation,
            data=None if data is None else json.dumps(data, ensure_ascii=False).encode("utf8"),
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"},
            method="GET" if data is None else "POST")
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)


API_SCRIPT = r"""
(async () => {
  const require = window.__bandWebpackRequire;
  if (typeof require !== 'function') return {ok:false, reason:'client_not_ready'};
  if (!location.pathname.startsWith('/band/104432443/')) return {ok:false, reason:'wrong_page'};
  const find = name => {
    const cache = window.__creoDirectoryApis || (window.__creoDirectoryApis = {});
    if(cache[name]) return cache[name];
    const known = ['getApplicationOfBand','getApplicationDetailInfo','acceptApplication','getJoinInfo'].includes(name)
      ? 929 : ['getMembersOfBand','getUpdatedMembers'].includes(name) ? 870 : null;
    if(known && String(require.m?.[known] || '').includes(name+':function')) {
      const owner = require(known);
      if(typeof owner?.[name] === 'function') return cache[name] = owner;
    }
    for(const entry of Object.values(require.c || {})) {
      const mod = entry.exports;
      for(const owner of [mod,mod?.default]) {
        if(owner && typeof owner[name] === 'function') return cache[name] = owner;
      }
    }
    for(const id of Object.keys(require.m || {})) {
      const source = String(require.m[id]);
      // Import only a definition, never an unrelated screen mentioning the API.
      if(!source.includes(name+':function') && !source.includes(name+'=function')) continue;
      try { const mod = require(id); for(const owner of [mod, mod && mod.default]) {
        if(owner && typeof owner[name] === 'function') return cache[name] = owner;
      }} catch(_) {}
    }
    throw new Error('api_unavailable');
  };
  try {
    const operation = __OPERATION__, args = __ARGS__;
    const readBand = async (url, data) => {
      const response = await find('getLoginV1ClientWithoutErrorAlert')
        .getLoginV1ClientWithoutErrorAlert().send({url:'https://api.band.us'+url,data});
      if(!response?.result_data) {
        const error = new Error('band_request_failed');
        error.code = response?.result_code; throw error;
      }
      return response.result_data;
    };
    let data;
    if(operation === 'memberByUserNo') {
      data = await readBand('/v2.3.0/get_member',{band_no:'104432443',user_no:args[0]});
    } else if(operation === 'rosterList') {
      if(window.__creoRosterJob?.failed && Date.now()-window.__creoRosterJob.startedAt>120000)
        delete window.__creoRosterJob;
      if(!window.__creoRosterJob) {
        const job = window.__creoRosterJob = {startedAt:Date.now(),count:0,expectedCount:0,views:[]};
        // Do not block application polling while collecting capped list views.
        void (async()=>{
          const members = new Map(), searchTerms = new Set(), numericTerms = new Set();
          const addTerms = name => {
            const first = [...String(name || '').normalize('NFC').trim()][0];
            if(!first) return;
            searchTerms.add(first);
            const code = first.codePointAt(0)-0xAC00;
            if(code>=0 && code<11172) searchTerms.add('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(code/588)]);
          };
          for(const order of [null,'recently_joined']) {
            const view = {order,count:0,missingIdentity:0}; job.views.push(view);
            try {
              const page = await find('getMembersOfBand').getMembersOfBand('104432443',order);
              if(!Array.isArray(page.members)) throw new Error('roster_schema_changed');
              job.expectedCount = Math.max(job.expectedCount, Number(page.member_count) || 0);
              view.count = page.members.length;
              view.fields = Object.keys(page.members[0] || {});
              for(const member of page.members) {
                for(const digit of String(member.name || '').match(/\d/g) || []) numericTerms.add(digit);
                const identity = member.user_no || member.member_key;
                if(!identity) { view.missingIdentity++; continue; }
                if(order && !members.has(String(identity))) addTerms(member.name);
                members.set(String(identity),member.user_no ? {user_no:member.user_no}
                  : {member_key:member.member_key});
              }
              if(!order) addTerms(page.members.findLast(member=>member.user_no||member.member_key)?.name);
            } catch(error) {
              view.failed = true;
              const code = error?.result_code || error?.code;
              if(/^\d{1,8}$/.test(String(code))) view.code = String(code);
            }
            job.count = members.size;
            if(job.expectedCount && members.size >= job.expectedCount) break;
          }
          // The member screen searches with filter "member". Search the name
          // prefixes observed beyond the alphabetical cap, never guessed IDs.
          for(const query of [...new Set([...searchTerms,...numericTerms])].slice(0,170)) {
            if(members.size >= job.expectedCount) break;
            const view = {order:'search',count:0,missingIdentity:0}; job.views.push(view);
            try {
              const page = await find('searchMember').searchMember(query,'104432443','member');
              const rows = page.members;
              if(!Array.isArray(rows)) throw new Error('roster_schema_changed');
              view.count = rows.length; view.fields = Object.keys(rows[0] || {});
              for(const member of rows) {
                const identity = member.user_no || member.member_key;
                if(!identity) { view.missingIdentity++; continue; }
                members.set(String(identity),member.user_no ? {user_no:member.user_no}
                  : {member_key:member.member_key});
              }
              job.count = members.size;
            } catch(error) { view.failed = true; }
          }
          job.members = [...members.values()].sort((a,b)=>String(a.user_no||a.member_key).localeCompare(String(b.user_no||b.member_key)));
          job.failed = !job.expectedCount || members.size < job.expectedCount;
          job.ready = true;
        })().catch(()=>{job.failed=true});
      }
      const job = window.__creoRosterJob;
      data = job.ready ? {members:job.members,expectedCount:job.expectedCount,views:job.views}
        : {pending:!job.failed,failed:!!job.failed,count:job.count,expectedCount:job.expectedCount,views:job.views};
    } else if(operation === 'rosterDetails') {
      const rows = args[0].slice(0,10), members = new Array(rows.length);
      const joinInfo = {read:0,answers:0,unavailable:0,codes:{}};
      let next = 0;
      const read = async () => {
        while(next < rows.length) {
          const index = next++, row = {...rows[index]};
          if(!row.member_key) {
            if(!row.user_no) throw new Error('member_identity_missing');
            Object.assign(row, await readBand('/v2.3.0/get_member',
              {band_no:'104432443',user_no:row.user_no}));
          } else if(!Object.hasOwn(row,'description') || !row.user_no) {
            Object.assign(row, await find('getMemberByMemberKey').getMemberByMemberKey(
              '104432443',row.member_key,{needUserNo:true}));
          }
          if(!row.member_key) throw new Error('member_key_missing');
          try {
            const info = await readBand('/v2.0.1/get_join_info',
              {band_no:'104432443',member_key:row.member_key});
            joinInfo.read++;
            joinInfo.fields = Object.keys(info || {});
            if(info?.data?.application?.join_answer) {
              row.join_answer = info.data.application.join_answer; joinInfo.answers++;
            }
          } catch(error) {
            // Keep only aggregate diagnostics, never responses or member data.
            joinInfo.unavailable++;
            const value = error?.responseJSON?.result_code || error?.code || error?.status;
            const code = /^\d{1,8}$/.test(String(value)) ? String(value) : 'unknown';
            joinInfo.codes[code] = (joinInfo.codes[code] || 0)+1;
          }
          members[index] = row;
        }
      };
      await Promise.all(Array.from({length:Math.min(3,rows.length)},read));
      data = {members,joinInfo};
    } else data = await find(operation)[operation](...args);
    return {ok:true, data};
  } catch(error) {
    return {ok:false, reason:error?.message === 'api_unavailable' ? 'api_unavailable' : 'band_request_failed',
      code:/^\d{1,8}$/.test(String(error?.code)) ? String(error.code) : undefined};
  }
})()
"""


class DirectoryMonitor(base.BandJoinMonitor):
    def __init__(self, config, directory, root=ROOT):
        self.directory = directory
        self.next_poll = 0.0
        self.last_heartbeat = 0.0
        self.last_refresh = time.monotonic()
        self.next_roster = 0.0
        self.next_session = 0.0
        self.synced_session_digest = ""
        self.next_updates = 0.0
        self.updated_members = []
        self.update_fingerprints = {}
        self.recent_join_cursor = 0.0
        self.progress = None
        self.roster_rows = []
        self.roster_index = 0
        self.roster_loaded = False
        self.roster_discovered = None
        self.saved_fingerprints = {}
        self.pending_count = 0
        self.approved_count = 0
        self.runtime_state = "starting"
        self.poll_success_at = 0.0
        self.api_shapes = set()
        self.auto_enabled = os.environ.get("BAND_DIRECTORY_AUTO_APPROVE") == "true"
        self.session_revision = os.environ.get("BAND_SESSION_REVISION", "initial")
        # Do not fall back to an old bootstrap cookie after a temporary database
        # outage. main() serves health while retrying this encrypted session read.
        session = directory.call("session")
        if session.get("revision") == self.session_revision and session.get("cookies"):
            os.environ["BAND_COOKIE_JSON"] = json.dumps(session["cookies"])
        super().__init__(config, root)

    def api(self, connection, operation, args):
        script = API_SCRIPT.replace("__OPERATION__", json.dumps(operation)).replace("__ARGS__", json.dumps(args))
        try:
            result = base.runtime_value(connection.call("Runtime.evaluate", {
                "expression": script, "returnByValue": True, "awaitPromise": True},
                timeout=45 if operation == "rosterDetails" else 15))
        except TimeoutError:
            print("BAND API timeout:", operation, flush=True)
            raise
        if not isinstance(result, dict) or not result.get("ok"):
            reason = result.get("reason", "band_request_failed") if isinstance(result, dict) else "band_request_failed"
            print("BAND API unavailable:", operation, reason,
                  result.get("code", "") if isinstance(result, dict) else "", flush=True)
            raise RuntimeError(reason)
        if operation not in self.api_shapes:
            self.api_shapes.add(operation)
            data = result.get("data")
            shape = {"operation": operation, "type": type(data).__name__}
            if isinstance(data, dict):
                shape["fields"] = list(data)
                shape["lists"] = {k: {"count": len(v), "fields": list(v[0]) if v and isinstance(v[0], dict) else []}
                                  for k, v in data.items() if isinstance(v, list)}
            print("BAND response schema:", json.dumps(shape), flush=True)
        return result.get("data") or {}

    def _handle_event(self, connection, event):
        # Application records come only from the scoped API reader, not generic
        # network/DOM parsers that could confuse another member or phone field.
        if event.get("method") in {"Inspector.detached", "Target.detachedFromTarget"}:
            raise ConnectionError("browser_disconnected")
        if event.get("method") in {"Inspector.targetCrashed", "Target.targetCrashed"}:
            print("BAND renderer crashed; restarting isolated browser", flush=True)
            self.chrome.stop()
            raise ConnectionError("browser_renderer_crashed")
        if event.get("method") == "Page.javascriptDialogOpening":
            # Dismiss an error alert; never confirm an unexpected action dialog.
            kind = event.get("params", {}).get("type", "unknown")
            print("BAND browser dialog dismissed:", kind, flush=True)
            connection.call("Page.handleJavaScriptDialog", {"accept": False})

    def process_application(self, item, approve):
        record = member_record(item)
        if not record["memberKey"]:
            return
        application_id = record["memberKey"] + ":" + str(item.get("created_at") or item.get("applied_at") or "")
        fingerprint = hashlib.sha256(json.dumps(record["sources"], sort_keys=True).encode()).hexdigest()
        if self.saved_fingerprints.get(application_id) != fingerprint:
            self.directory.call("members", {"members": [record]})
            self.saved_fingerprints[application_id] = fingerprint
        if not self.auto_enabled or not eligible(record):
            return
        claim = self.directory.call("claim", {"applicationId": application_id, "member": record})
        if not claim.get("claimed"):
            return
        success = False
        try:
            approve(record["memberKey"])
            success = True
        finally:
            # A lost response is uncertain, never a reason to send another action.
            self.directory.call("finish", {"applicationId": application_id, "success": success})
        if success:
            self.approved_count += 1

    def poll(self, connection):
        paging = None
        count = 0
        for _ in range(20):
            args = [BAND_NO] + ([paging] if paging else [])
            result = self.api(connection, "getApplicationOfBand", args)
            items = result.get("items")
            if not isinstance(items, list):
                raise RuntimeError("application_schema_changed")
            self.checkpoint_session(connection, time.monotonic())
            count += len(items)
            for item in items:
                # The list omits the disclosed full phone; fetch the same detail
                # that the administrator sees before saving/deciding approval.
                detail = self.api(connection, "getApplicationDetailInfo", [BAND_NO, item["member_key"]])
                if not isinstance(detail.get("application"), dict):
                    raise RuntimeError("application_detail_schema_changed")
                item = {**item, **detail["application"]}
                self.process_application(item, lambda key: self.api(connection, "acceptApplication", [BAND_NO, key]))
            paging = result.get("paging", {}).get("next_params")
            if not paging:
                break
        self.pending_count = count
        self.runtime_state = "running"
        self.poll_success_at = time.monotonic()

    def checkpoint_session(self, connection, now):
        if now < self.next_session:
            return
        # Save the live, possibly rotated cookie jar as soon as BAND confirms
        # authentication. A later member-storage failure must not lose it.
        self._persist_session_cookie_snapshot(connection)
        if self._session_snapshot_path.is_file():
            snapshot = json.loads(self._session_snapshot_path.read_text(encoding="utf8"))
            cookies = snapshot.get("cookies", []) if isinstance(snapshot, dict) else snapshot
            digest = hashlib.sha256(json.dumps(cookies, sort_keys=True).encode()).hexdigest()
            if digest != self.synced_session_digest:
                self.directory.call("session", {"cookies": cookies, "revision": self.session_revision})
                self.synced_session_digest = digest
        self.next_session = now + 30

    def roster_step(self, connection):
        if self.progress is None:
            self.progress = self.directory.call("progress")
        if self.progress.get("complete"):
            return
        if not self.roster_loaded:
            page = self.api(connection, "rosterList", [])
            if page.get("pending"):
                discovered = (page.get("count", 0), page.get("expectedCount", 0))
                if discovered != self.roster_discovered:
                    print("Roster indexing:", *discovered, flush=True)
                    self.roster_discovered = discovered
                return
            rows = page.get("members")
            expected = int(page.get("expectedCount") or 0)
            if not isinstance(rows, list) or not expected or len(rows) < expected:
                print("Roster coverage incomplete:", page.get("count", len(rows) if isinstance(rows, list) else 0), "of", expected,
                      json.dumps(page.get("views", [])), flush=True)
                raise RuntimeError("roster_schema_changed")
            self.roster_rows = rows
            self.roster_index = min(int(self.progress.get("offset", 0)), len(rows))
            self.roster_loaded = True
            print("Existing roster coverage:", len(rows), "of", expected, flush=True)
        if self.roster_index >= len(self.roster_rows):
            self.directory.call("progress", {"offset": self.roster_index, "complete": True})
            self.progress["complete"] = True
            return
        batch = self.roster_rows[self.roster_index:self.roster_index + 10]
        detail_page = self.api(connection, "rosterDetails", [batch])
        details = detail_page.get("members")
        if not isinstance(details, list) or len(details) != len(batch) or any(not row.get("member_key") for row in details):
            raise RuntimeError("roster_schema_changed")
        self.directory.call("members", {"members": [member_record(row, existing=True) for row in details]})
        offset = int(self.progress.get("offset", 0)) + len(batch)
        # Advance only after durable records AND the checkpoint are stored.
        # A failed checkpoint repeats safe upserts after a restart.
        self.directory.call("progress", {"offset": offset, "complete": False})
        self.roster_index += len(batch)
        self.progress["offset"] = offset
        if offset % 100 == 0 or offset == len(self.roster_rows):
            print("Roster saved:", offset, "of", len(self.roster_rows),
                  "join info:", json.dumps(detail_page.get("joinInfo", {})), flush=True)

    def update_step(self, connection, now):
        if now >= self.next_updates and not self.updated_members:
            data = self.api(connection, "getUpdatedMembers", [BAND_NO])
            rows = data.get("profile_updated_members")
            if not isinstance(rows, list):
                raise RuntimeError("updated_members_schema_changed")
            recent = self.api(connection, "getMembersOfBand", [BAND_NO, "recently_joined"])
            if not isinstance(recent.get("members"), list):
                raise RuntimeError("updated_members_schema_changed")
            if not self.recent_join_cursor:
                self.recent_join_cursor = float((self.progress or {}).get("updatedAt", 0)) / 1000 - 600
            for row in recent["members"]:
                joined = float(row.get("created_at") or 0)
                joined = joined / 1000 if joined > 100000000000 else joined
                if joined >= self.recent_join_cursor:
                    rows.append(row)
            pending = {}
            for row in rows:
                identity = str(row.get("member_key") or row.get("user_no") or "")
                fingerprint = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
                if identity and self.update_fingerprints.get(identity) != fingerprint:
                    pending[identity] = {"row": row, "fingerprint": fingerprint, "identity": identity}
            self.updated_members = list(pending.values())
            # Keep an overlap window for members approved by another co-leader.
            self.recent_join_cursor = time.time() - 600
            self.next_updates = now + 600
        if not self.updated_members:
            return
        batch = self.updated_members[:10]
        details = self.api(connection, "rosterDetails", [[entry["row"] for entry in batch]]).get("members")
        if not isinstance(details, list) or len(details) != len(batch):
            raise RuntimeError("updated_members_schema_changed")
        self.directory.call("members", {"members": [member_record(row, existing=True) for row in details]})
        for entry in batch:
            self.update_fingerprints[entry["identity"]] = entry["fingerprint"]
        del self.updated_members[:len(batch)]

    def heartbeat(self):
        state = self.runtime_state
        if state == "running" and time.monotonic() - self.poll_success_at > 60:
            state = "error"
        self.directory.call("heartbeat", {"connected": state == "running",
            "autoApprove": self.auto_enabled, "pending": self.pending_count,
            "approved": self.approved_count, "rosterComplete": bool((self.progress or {}).get("complete")),
            "state": state, "serviceUrl": os.environ.get("RENDER_EXTERNAL_URL", "")})

    def _periodic_dom_tasks(self, connection):
        now = time.monotonic()
        if now < self.next_poll:
            return
        self.next_poll = now + 3
        try:
            self.poll(connection)
            if now >= self.next_roster:
                self.next_roster = now + 3
                try:
                    self.roster_step(connection)
                    if (self.progress or {}).get("complete"):
                        self.update_step(connection, now)
                except (RuntimeError, OSError) as exc:
                    if isinstance(exc, (TimeoutError, ConnectionError)):
                        raise
                    # Initial import failures must not delay valid applications.
                    self.next_roster = now + 30
                    print("Member sync retry:", type(exc).__name__, flush=True)
            if now - self.last_heartbeat >= 20:
                self.heartbeat()
                self.last_heartbeat = now
        except Exception as exc:
            self.runtime_state = "error"
            self.next_poll = now + 30
            self.logger.warning("Directory worker waiting: %s", type(exc).__name__)
            safe_reasons = {"client_not_ready", "wrong_page", "api_unavailable", "band_request_failed",
                            "application_schema_changed", "application_detail_schema_changed", "roster_schema_changed", "member_identity_missing",
                            "member_key_missing", "updated_members_schema_changed"}
            print("Directory worker waiting:", str(exc) if str(exc) in safe_reasons else type(exc).__name__, flush=True)
            if isinstance(exc, TimeoutError):
                # CDP events continue arriving while an awaited API is blocked.
                # Handle a native alert/crash before probing the page again.
                for _ in range(2000):
                    try:
                        self._handle_event(connection, connection.get_event(timeout=0))
                    except queue.Empty:
                        break
            try:
                location = base.runtime_value(connection.call("Runtime.evaluate", {"expression": "location.href", "returnByValue": True}, timeout=3))
                if "/band/104432443/" not in str(location):
                    self.runtime_state = "login_required"
                elif str(exc) in {"client_not_ready", "api_unavailable"} and now - self.last_refresh > 120:
                    connection.call("Page.reload", {})
                    self.last_refresh = now
                self.heartbeat()
            except TimeoutError:
                # A network promise may be slow while the page is healthy. Only
                # restart if even a synchronous location read cannot respond.
                self.chrome.stop()
                raise ConnectionError("browser_unresponsive")
            except Exception:
                pass


def build_config():
    config = copy.deepcopy(base.DEFAULT_CONFIG)
    tmp = Path(os.environ.get("BAND_BOT_DATA_DIR", "/tmp/creo-band-directory"))
    tmp.mkdir(parents=True, exist_ok=True)
    executable = os.environ.get("BAND_CHROME_EXECUTABLE", "")
    if not executable:
        executable = subprocess.check_output(["node", "-e",
            "Promise.resolve(require('puppeteer').executablePath()).then(p=>process.stdout.write(p)).catch(()=>process.exit(1))"],
            cwd=ROOT, text=True).strip()
    config.update({"chrome_executable": executable, "chrome_profile_dir": str(tmp / "chrome"),
        "chrome_headless": True, "band_start_url": "https://www.band.us/band/104432443/applications",
        "chrome_extra_args": ["--js-flags=--max-old-space-size=128", "--blink-settings=imagesEnabled=false"],
        "state_file": str(tmp / "state.json"), "log_file": str(tmp / "worker.log"),
        "runtime_status_file": str(tmp / "runtime.json"), "diagnostic_file": str(tmp / "diagnostic.jsonl"),
        "notification_enabled": False, "notification_trigger_enabled": False,
        "auto_approve_enabled": False, "auto_reject_enabled": False,
        "dom_action_enabled": False, "dom_read_enabled": False, "application_count_poll_seconds": 3})
    return config


def main():
    directory = DirectoryClient()
    monitor = None
    shutdown = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"ok": True, "service": "creo-band-directory",
                               "state": monitor.runtime_state if monitor else "starting"}).encode()
            self.send_response(200 if self.path in {"/", "/healthz"} else 404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "10000"))), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    def stop(*_args):
        shutdown.set()
        if monitor:
            monitor.stop_event.set()

    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, stop)
    try:
        while not shutdown.is_set():
            if monitor is None:
                try:
                    monitor = DirectoryMonitor(build_config(), directory)
                except Exception as exc:
                    print("Directory startup waiting:", type(exc).__name__, flush=True)
                    shutdown.wait(10)
                    continue
                monitor.start()
            if shutdown.wait(10):
                break
            monitor.write_runtime_status()
            try:
                monitor.heartbeat()
            except Exception:
                pass
    finally:
        if monitor:
            monitor.stop()
        server.shutdown()


if __name__ == "__main__":
    main()
