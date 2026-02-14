#include "engine/interaction/interaction_session.h"

#if ENGINE_FEATURE_DRAFT
#error "interaction_draft_stub.cpp should only be compiled when ENGINE_FEATURE_DRAFT=0"
#endif

void InteractionSession::beginDraft(const BeginDraftPayload& p) {
    (void)p;
}

void InteractionSession::updateDraft(float x, float y, std::uint32_t modifiers) {
    (void)x;
    (void)y;
    (void)modifiers;
}

void InteractionSession::appendDraftPoint(float x, float y, std::uint32_t modifiers) {
    (void)x;
    (void)y;
    (void)modifiers;
}

void InteractionSession::cancelDraft() {
}

std::uint32_t InteractionSession::commitDraft() {
    return 0;
}

DraftDimensions InteractionSession::getDraftDimensions() const {
    DraftDimensions dims{};
    dims.active = false;
    return dims;
}
