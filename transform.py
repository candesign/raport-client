#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from typing import Dict, Iterable, Tuple


def _norm_key(value: str | None) -> str:
    if value is None:
        return ""
    # Normalize to make joins resilient to quoting/whitespace differences.
    v = value.strip().strip('"').strip()
    v = re.sub(r"\s+", " ", v)
    return v


def _read_mapping(
    path: str,
    *,
    key_field: str,
    value_field: str,
    delimiter: str = ";",
) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter, quotechar='"')
        for row in reader:
            key = _norm_key(row.get(key_field))
            val = (row.get(value_field) or "").strip().strip('"').strip()
            if key:
                mapping[key] = val
    return mapping


def transform(
    input_csv: str,
    *,
    output_csv: str,
    klienci_csv: str,
    kategorie_csv: str,
    delimiter: str = ";",
) -> Tuple[int, int]:
    klient_by_point = _read_mapping(
        klienci_csv, key_field="Klient", value_field="Numer klienta", delimiter=delimiter
    )
    category_en_by_pl = _read_mapping(
        kategorie_csv, key_field="Kategoria PL", value_field="Kategoria EN", delimiter=delimiter
    )

    out_fieldnames = [
        "Nr",
        "Model",
        "Numer seryjny",
        "Kategoria produktu",
        "Numer klienta",
        "Punkt handlowy",
        "Wartość bonu",
        "Data akceptacji",
    ]

    processed = 0
    written = 0

    with open(input_csv, "r", encoding="utf-8-sig", newline="") as f_in, open(
        output_csv, "w", encoding="utf-8", newline=""
    ) as f_out:
        reader = csv.DictReader(f_in, delimiter=delimiter, quotechar='"')
        writer = csv.DictWriter(
            f_out,
            fieldnames=out_fieldnames,
            delimiter=delimiter,
            quotechar='"',
            quoting=csv.QUOTE_MINIMAL,
            lineterminator="\n",
        )
        writer.writeheader()

        for row in reader:
            processed += 1
            status = (row.get("Status") or "").strip().strip('"').strip()
            if status != "approved":
                continue

            nr = (row.get("Nr") or "").strip()
            model = (row.get("Model") or "").strip()
            serial = (row.get("Numer seryjny") or "").strip()

            category_pl = (row.get("Kategoria") or "").strip()
            category_en = category_en_by_pl.get(_norm_key(category_pl), category_pl)

            point = (row.get("Punkt handlowy") or "").strip()
            klient_no = klient_by_point.get(_norm_key(point), "")

            bonus = (row.get("Kwota cashback") or "").strip()
            accepted_at = (row.get("Data akceptacji") or "").strip()

            writer.writerow(
                {
                    "Nr": nr,
                    "Model": model,
                    "Numer seryjny": serial,
                    "Kategoria produktu": category_en,
                    "Numer klienta": klient_no,
                    "Punkt handlowy": point,
                    "Wartość bonu": bonus,
                    "Data akceptacji": accepted_at,
                }
            )
            written += 1

    return processed, written


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Transform CSV: filter approved, map categories and clients, produce a simplified CSV."
    )
    parser.add_argument("input", help="Input CSV (e.g. data.csv)")
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="Output CSV (default: output.csv next to input)",
    )
    parser.add_argument(
        "--klienci",
        default=None,
        help="Path to klienci.csv (default: alongside this script)",
    )
    parser.add_argument(
        "--kategorie",
        default=None,
        help="Path to kategorie.csv (default: alongside this script)",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_csv = os.path.abspath(args.input)
    output_csv = (
        os.path.abspath(args.output)
        if args.output
        else os.path.join(os.path.dirname(input_csv), "output.csv")
    )
    klienci_csv = os.path.abspath(args.klienci) if args.klienci else os.path.join(script_dir, "klienci.csv")
    kategorie_csv = os.path.abspath(args.kategorie) if args.kategorie else os.path.join(script_dir, "kategorie.csv")

    missing = [p for p in (input_csv, klienci_csv, kategorie_csv) if not os.path.exists(p)]
    if missing:
        print("Missing required file(s):", file=sys.stderr)
        for p in missing:
            print(f" - {p}", file=sys.stderr)
        return 2

    processed, written = transform(
        input_csv,
        output_csv=output_csv,
        klienci_csv=klienci_csv,
        kategorie_csv=kategorie_csv,
        delimiter=";",
    )
    print(f"Processed rows: {processed}")
    print(f"Written rows (Status=approved): {written}")
    print(f"Output: {output_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

