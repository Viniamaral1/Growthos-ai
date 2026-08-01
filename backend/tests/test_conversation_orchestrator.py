import unittest

from app.services.conversation_orchestrator import decide
from app.services.research_project_service import _deterministic_discovery


class ConversationOrchestratorTests(unittest.TestCase):
    def decision(self, message: str, **kwargs):
        defaults = {
            "active_research": False,
            "paused_research": False,
            "explicit_research_mode": False,
            "active_research_status": None,
        }
        defaults.update(kwargs)
        return decide(message, **defaults)

    def test_writing_interrupts_research(self):
        result = self.decision(
            "Write me a polite email to a supplier asking for a quotation.",
            active_research=True,
            active_research_status="discovery",
        )
        self.assertEqual(result.intent, "direct_writing")
        self.assertTrue(result.detach_active_research)
        self.assertFalse(result.use_workspace_context)

    def test_new_idea_is_isolated(self):
        result = self.decision(
            "I have an idea.",
            active_research=True,
            active_research_status="discovery",
        )
        self.assertEqual(result.intent, "research_start")
        self.assertTrue(result.detach_active_research)
        self.assertFalse(result.use_workspace_context)

    def test_courier_comparison_starts_research(self):
        result = self.decision(
            "I need to compare courier companies for shipping a pallet from London to Manchester."
        )
        self.assertEqual(result.intent, "research_start")
        discovery = _deterministic_discovery(
            "I need to compare courier companies for shipping a pallet from London to Manchester."
        )
        self.assertIsNotNone(discovery)
        self.assertEqual(discovery.questions[0].id, "shipment_details")

    def test_weather_does_not_use_workspace(self):
        result = self.decision(
            "What's the weather?",
            active_research=True,
            active_research_status="discovery",
        )
        self.assertEqual(result.intent, "utility")
        self.assertFalse(result.use_workspace_context)

    def test_short_answer_continues_discovery(self):
        result = self.decision(
            "It is a mobile app for independent restaurants.",
            active_research=True,
            active_research_status="discovery",
        )
        self.assertEqual(result.intent, "research_continue")

    def test_new_question_pauses_discovery(self):
        result = self.decision(
            "What is EBITDA?",
            active_research=True,
            active_research_status="discovery",
        )
        self.assertEqual(result.intent, "general")
        self.assertTrue(result.detach_active_research)


if __name__ == "__main__":
    unittest.main()
