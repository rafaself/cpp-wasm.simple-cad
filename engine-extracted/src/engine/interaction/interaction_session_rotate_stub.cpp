#include "engine/interaction/interaction_session.h"

#if ENGINE_FEATURE_ROTATE
#error "interaction_session_rotate_stub.cpp should only be compiled when ENGINE_FEATURE_ROTATE=0"
#endif

bool InteractionSession::updateRotate(float worldX, float worldY, std::uint32_t modifiers) {
    (void)worldX;
    (void)worldY;
    (void)modifiers;
    return false;
}
