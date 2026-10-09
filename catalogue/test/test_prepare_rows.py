"""
Swallowed errors in the two prepare jobs (category-check.ts A7).

Each handler used to turn a bad upstream value into "no value" and say nothing. The
rule now: never drop silently. Every failure kind is counted on its own and the job's
end summary prints the count with up to three of the bad values. A bad field is never
fatal, because Open Food Facts is untrusted input.

Run with `python -m pytest test/test_prepare_rows.py` from catalogue/, or with
`python -I test/test_prepare_rows.py` (the plain runner at the bottom).

The jobs read sys.argv at import time, so the end-to-end tests run them as child
processes against tiny temp files; the unit tests import the module.
"""

import gzip
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "src")
sys.path.insert(0, SRC)

import prepare_rows as pr  # noqa: E402


def reset():
    """Clear the fault ledger; a no-op before the ledger exists, so the controls can run red-free."""
    getattr(pr, "reset_faults", lambda: None)()


def faults(kind):
    """How many faults of one kind the ledger holds; 0 when there is no ledger."""
    return getattr(pr, "fault_count", lambda k: 0)(kind)


def run_job(script, *args):
    r = subprocess.run(
        [sys.executable, os.path.join(SRC, script), *args],
        capture_output=True, text=True, encoding="utf-8",
    )
    return r.returncode, r.stdout, r.stderr


def summary_line(stdout, label):
    for line in stdout.splitlines():
        if line.startswith(label):
            return line
    raise AssertionError(f"no {label!r} line in the end summary:\n{stdout}")


def make_parquet(path, rows_sql):
    import duckdb

    con = duckdb.connect()
    con.execute(f"COPY ({rows_sql}) TO '{path}' (FORMAT PARQUET)")
    con.close()


# --- handler 1: prepare_rows.py size_from_name float parse -------------------

def test_name_size_that_will_not_parse_is_counted():
    # The real NAME_SIZE can only capture something float() accepts, so the handler is
    # reached by swapping in a pattern that can capture junk.
    import re

    real = pr.NAME_SIZE
    pr.NAME_SIZE = re.compile(r"(\w+?)\s?(g)\b")
    reset()
    try:
        assert pr.size_from_name("Cheerios abc g") == (None, None)
        assert faults("name_size") == 1
        assert any("size in name unparseable" in l and "'abc'" in l for l in getattr(pr, "fault_lines", list)()), "no fault line"
    finally:
        pr.NAME_SIZE = real
        reset()


def test_name_size_control_valid_name_is_unchanged_and_uncounted():
    reset()
    assert pr.size_from_name("Cheerios Original 340 g") == (340.0, "g")
    assert pr.size_from_name("Milk 1,5 L") == (1500.0, "ml")
    assert faults("name_size") == 0


# --- handler 2: product_quantity falls through, and is counted ---------------

def test_bad_product_quantity_falls_through_to_quantity_and_is_counted():
    reset()
    # Unchanged behaviour: the free-text quantity still supplies the size.
    assert pr.parse_size("12 x 355 mL", "not-a-number", "g") == (4260.0, "ml")
    assert faults("product_quantity") == 1
    assert any("product_quantity unparseable" in l and "'not-a-number'" in l for l in getattr(pr, "fault_lines", list)())


def test_product_quantity_control_valid_value_is_unchanged_and_uncounted():
    reset()
    assert pr.parse_size("ignored", "340", "g") == (340.0, "g")
    assert pr.parse_size(None, "1,5", "l") == (1500.0, "ml")
    assert faults("product_quantity") == 0


# --- handler 3: clean_int ----------------------------------------------------

def test_clean_int_counts_each_field_separately():
    reset()
    assert pr.clean_int(float("nan"), "nova_group") is None
    assert pr.clean_int("n/a", "additives_n") is None
    assert pr.clean_int(float("inf"), "additives_n") is None  # OverflowError, which used to crash the job
    assert faults("nova_group") == 1
    assert faults("additives_n") == 2


def test_clean_int_control_real_values_unchanged():
    reset()
    assert pr.clean_int(None) is None
    assert pr.clean_int(0.0) == 0
    assert pr.clean_int(4.0) == 4
    assert pr.clean_int("3") == 3
    assert faults("nova_group") == 0 and faults("additives_n") == 0


def test_prepare_rows_summary_prints_every_kind_with_examples():
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "in.parquet")
        out = os.path.join(d, "rows.jsonl")
        make_parquet(
            src,
            # product_name is a list of {lang, text}, built here from nm
            "SELECT code, [{'lang': 'en', 'text': nm}] AS product_name, product_quantity, nova_group, additives_n "
            "FROM (VALUES "
            "('111', 'Good Cereal 340 g', '340', 4.0, 1.0),"
            "('222', 'Bad Cereal', 'oops', 'nan'::DOUBLE, 'nan'::DOUBLE),"
            "('333', 'Bad Two', 'oops2', 'nan'::DOUBLE, 2.0)"
            ") t(code, nm, product_quantity, nova_group, additives_n)",
        )
        code, stdout, stderr = run_job("prepare_rows.py", src, out)
        assert code == 0, stderr
        assert summary_line(stdout, "product_quantity unparseable").split()[2] == "2", stdout
        assert "'oops'" in stdout and "'oops2'" in stdout, stdout
        assert summary_line(stdout, "nova_group not an integer").split()[4] == "2", stdout
        assert summary_line(stdout, "additives_n not an integer").split()[4] == "1", stdout
        assert summary_line(stdout, "size in name unparseable").split()[4] == "0", stdout
        # the rows are all still written: a bad field is never fatal
        assert sum(1 for _ in open(out, encoding="utf-8")) == 3


# --- handler 4: prepare_rows_jsonl.py JSONDecodeError -------------------------

def write_export(path, lines):
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        for line in lines:
            fh.write(line + "\n")


def test_jsonl_malformed_lines_have_their_own_counter():
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "export.jsonl.gz")
        out = os.path.join(d, "rows.jsonl")
        good = json.dumps({"code": "111", "product_name": "Soap 100 g", "lang": "en"})
        nocode = json.dumps({"product_name": "No Code Soap", "lang": "en"})
        write_export(src, [good, "{not json at all", nocode, '{"code": "9", "oops', "[1, 2"])
        code, stdout, stderr = run_job("prepare_rows_jsonl.py", src, out, "testsource")
        assert code == 0, stderr
        # Malformed lines no longer hide inside "skipped, no code".
        assert summary_line(stdout, "skipped, no code").split()[-1] == "1", stdout
        line = summary_line(stdout, "malformed json")
        assert line.split()[2] == "3", stdout
        assert "'{not json at all'" in stdout and "'[1, 2'" in stdout, stdout
        # Control: the good row is written exactly as before.
        rows = [json.loads(l) for l in open(out, encoding="utf-8")]
        assert [r["code"] for r in rows] == ["111"]
        assert rows[0]["size_value"] == 100.0 and rows[0]["source"] == "testsource"


def test_jsonl_summary_also_prints_the_size_fault_kinds():
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "export.jsonl.gz")
        out = os.path.join(d, "rows.jsonl")
        write_export(src, [json.dumps({"code": "1", "product_name": "Soap", "lang": "en", "product_quantity": "zzz", "quantity": "2 x 50 g"})])
        code, stdout, stderr = run_job("prepare_rows_jsonl.py", src, out)
        assert code == 0, stderr
        assert summary_line(stdout, "product_quantity unparseable").split()[2] == "1", stdout
        assert "'zzz'" in stdout
        assert json.loads(open(out, encoding="utf-8").readline())["size_value"] == 100.0


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok    {name}")
            except Exception as e:  # report every failure, then exit non-zero
                failed += 1
                print(f"FAIL  {name}: {type(e).__name__}: {e}")
    raise SystemExit(1 if failed else 0)
