# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chemical-safety gating: quote the recorded label, never invent / never exceed it."""

import unittest

from cago.chatbot import safety


class TestSafetyLabelQuote(unittest.TestCase):
	def _prod(self, instr=None, name="Thuốc trừ sâu X"):
		return [{"display_name": name, "label_instructions": instr} for instr in ([instr] if instr else [None])]

	def test_quotes_label_for_dosage_when_recorded(self):
		prod = [{"display_name": "Thuốc X", "label_instructions": "Pha 10ml cho bình 16 lít, phun đều."}]
		self.assertTrue(safety.answerable_from_data(["dosage"], prod))
		ans = safety.label_answer(prod)
		self.assertIn("Pha 10ml", ans)
		self.assertIn("nhãn", ans.lower())

	def test_never_answers_stronger_than_label_even_with_instructions(self):
		prod = [{"display_name": "Thuốc X", "label_instructions": "Pha 10ml/bình."}]
		self.assertFalse(safety.answerable_from_data(["dosage", "stronger_than_label"], prod))
		self.assertFalse(safety.answerable_from_data(["medical"], prod))

	def test_refuses_when_no_instructions_on_file(self):
		self.assertFalse(safety.answerable_from_data(["dosage"], [{"display_name": "Y"}]))
		self.assertIsNone(safety.label_answer([{"display_name": "Y"}]))

	def test_only_single_focused_product(self):
		two = [
			{"display_name": "A", "label_instructions": "x"},
			{"display_name": "B", "label_instructions": "y"},
		]
		# Ambiguous which one → don't quote.
		self.assertFalse(safety.answerable_from_data(["dosage"], two))
