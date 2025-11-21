Option 1: Save and restore yaw/pitch around placeBlock() [RECOMMENDED]

Capture yaw/pitch before bot.placeBlock()
Let placeBlock() do its internal snap
Immediately restore the original yaw/pitch after placement
Bot appears to maintain its gaze throughout
Option 2: Keep pathfinder.enableLook disabled longer

Already disabled in 
prepareForPlacement()
But it gets re-enabled before we call placeBlock()
Keep it disabled through the entire placement attempt
Option 3: Use bot.look() to restore camera after placement

Similar to Option 1 but using bot.look(yaw, pitch, false) for smooth restoration
Might still show a brief snap before restoration