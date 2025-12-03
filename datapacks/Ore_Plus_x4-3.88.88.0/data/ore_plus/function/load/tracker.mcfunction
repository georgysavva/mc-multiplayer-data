# tracker
execute as @a at @s unless score @s ore_plus.isload matches 1 run function ore_plus:load/player
# repeat
schedule function ore_plus:load/tracker 5s replace