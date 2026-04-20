# Règles de Donjons & Dragons 5e — Référence pour développement de jeu

> Document de référence condensé des règles officielles de D&D 5e (System Reference Document, licence OGL/Creative Commons). Destiné à servir de contexte pour la conception d'un jeu de rôle en ligne. Organisé pour être facilement parsable par un LLM : sections autonomes, tables structurées, formules explicites.

---

## 1. Concepts fondamentaux

### 1.1 Le jet de d20

Toute action dont l'issue est incertaine se résout par un **jet de d20** :

```
Résultat = 1d20 + modificateur de caractéristique + bonus de maîtrise (si applicable) + autres bonus
```

Trois types de jets de d20 :

- **Jet de caractéristique** : tester une capacité brute (ex. Force pour pousser une porte).
- **Jet d'attaque** : déterminer si une attaque touche sa cible.
- **Jet de sauvegarde** : résister à un effet (sort, piège, poison...).

Si le résultat est **≥ au Degré de Difficulté (DD)** ou **≥ à la Classe d'Armure (CA)** de la cible, l'action réussit.

### 1.2 Avantage et désavantage

- **Avantage** : lancer 2d20, garder le plus haut.
- **Désavantage** : lancer 2d20, garder le plus bas.
- Plusieurs sources d'avantage ne se cumulent pas : on a avantage ou pas.
- Avantage + désavantage s'annulent (jet normal), quel que soit le nombre de sources.

### 1.3 Réussite et échec critiques

Sur un **jet d'attaque** uniquement :
- **20 naturel** : critique — l'attaque touche automatiquement et les dés de dégâts de l'arme/du sort sont doublés (les modificateurs ne sont pas doublés).
- **1 naturel** : échec automatique, quel que soit le modificateur.

Les jets de caractéristique et de sauvegarde n'ont pas de critique par défaut (règle optionnelle possible).

### 1.4 Degrés de difficulté (DD) standard

| Difficulté       | DD |
|------------------|----|
| Très facile      | 5  |
| Facile           | 10 |
| Modérée          | 15 |
| Difficile        | 20 |
| Très difficile   | 25 |
| Quasi impossible | 30 |

---

## 2. Caractéristiques

Six caractéristiques définissent un personnage, chacune avec une **valeur** (généralement 1–20 pour un PJ, jusqu'à 30 pour des êtres divins) et un **modificateur** dérivé.

| Caractéristique | Abrév. | Gouverne                                           |
|-----------------|--------|----------------------------------------------------|
| Force           | FOR    | Puissance physique, combat au corps à corps        |
| Dextérité       | DEX    | Agilité, réflexes, équilibre, attaques à distance  |
| Constitution    | CON    | Endurance, résistance, points de vie               |
| Intelligence    | INT    | Raisonnement, mémoire, magie arcanique             |
| Sagesse         | SAG    | Perception, intuition, magie divine                |
| Charisme        | CHA    | Force de personnalité, persuasion, magie sorcière  |

### 2.1 Calcul du modificateur

```
Modificateur = (Valeur - 10) / 2, arrondi à l'inférieur
```

| Valeur | Modif. | Valeur | Modif. |
|--------|--------|--------|--------|
| 1      | -5     | 16-17  | +3     |
| 2-3    | -4     | 18-19  | +4     |
| 4-5    | -3     | 20-21  | +5     |
| 6-7    | -2     | 22-23  | +6     |
| 8-9    | -1     | 24-25  | +7     |
| 10-11  | 0      | 26-27  | +8     |
| 12-13  | +1     | 28-29  | +9     |
| 14-15  | +2     | 30     | +10    |

### 2.2 Génération des caractéristiques (PJ)

Trois méthodes standards :
- **Tableau standard** : 15, 14, 13, 12, 10, 8 (à répartir).
- **Achat de points** : 27 points, valeurs entre 8 et 15 avant modificateurs raciaux.
- **Lancer 4d6** : lancer 4d6, retirer le plus bas, additionner les 3 restants (6 fois).

### 2.3 Coût en points (achat de points)

| Valeur | Coût | Valeur | Coût |
|--------|------|--------|------|
| 8      | 0    | 12     | 4    |
| 9      | 1    | 13     | 5    |
| 10     | 2    | 14     | 7    |
| 11     | 3    | 15     | 9    |

---

## 3. Bonus de maîtrise

Le bonus de maîtrise dépend **uniquement du niveau** du personnage. Il s'applique aux jets d'attaque, jets de sauvegarde, compétences et DD de sort pour lesquels le personnage est maîtrisé.

| Niveau | Bonus | Niveau | Bonus |
|--------|-------|--------|-------|
| 1-4    | +2    | 13-16  | +5    |
| 5-8    | +3    | 17-20  | +6    |
| 9-12   | +4    |        |       |

---

## 4. Compétences

Chaque compétence est associée à une caractéristique. Jet = `1d20 + mod. de carac. + bonus de maîtrise (si maîtrisé)`.

| Compétence          | Carac. | Usage typique                               |
|---------------------|--------|---------------------------------------------|
| Acrobaties          | DEX    | Équilibre, cascades, esquives acrobatiques  |
| Arcanes             | INT    | Connaissance de la magie                    |
| Athlétisme          | FOR    | Escalade, nage, saut                        |
| Discrétion          | DEX    | Se cacher, bouger silencieusement           |
| Dressage            | SAG    | Calmer ou contrôler un animal               |
| Escamotage          | DEX    | Vol à la tire, tours de passe-passe         |
| Histoire            | INT    | Connaissance historique                     |
| Intimidation        | CHA    | Effrayer, menacer                           |
| Investigation       | INT    | Chercher indices, déduire                   |
| Médecine            | SAG    | Stabiliser un blessé, diagnostiquer         |
| Nature              | INT    | Connaissance de la faune/flore              |
| Perception          | SAG    | Remarquer quelque chose (vue, ouïe, odorat) |
| Perspicacité        | SAG    | Détecter mensonges, intentions              |
| Persuasion          | CHA    | Convaincre par la parole honnête            |
| Religion            | INT    | Connaissance des divinités et rites         |
| Représentation      | CHA    | Musique, acting, divertir                   |
| Survie              | SAG    | Pister, s'orienter, trouver abri            |
| Tromperie           | CHA    | Mentir, tromper                             |

### 4.1 Expertise

Certaines classes (Roublard, Barde) peuvent doubler leur bonus de maîtrise sur certaines compétences.

### 4.2 Tests passifs

Un score passif = `10 + modificateurs applicables`. Utile pour la Perception passive (détecter sans annoncer de jet) et l'Investigation passive.

---

## 5. Création de personnage

Un PJ est défini par :
1. **Race/Espèce** : modifie des caractéristiques, donne des traits.
2. **Classe** : détermine rôle, points de vie, capacités.
3. **Historique** : passé, compétences supplémentaires, trait spécial.
4. **Caractéristiques** : 6 valeurs.
5. **Équipement** : selon classe + historique.
6. **Alignement** (facultatif) : tendance morale/éthique.

### 5.1 Races principales (SRD)

| Race       | Ajust. carac.          | Taille  | Vitesse | Traits notables                                     |
|------------|------------------------|---------|---------|-----------------------------------------------------|
| Humain     | +1 à toutes (variant)  | Moyenne | 9 m     | Polyvalent                                          |
| Elfe       | +2 DEX                 | Moyenne | 9 m     | Vision nocturne, transe (4h de sommeil), immunité charme |
| Nain       | +2 CON                 | Moyenne | 7,5 m   | Vision nocturne, résistance poison, maîtrise armes naines |
| Halfelin   | +2 DEX                 | Petite  | 7,5 m   | Chanceux (relance 1), bravoure                      |
| Demi-Elfe  | +2 CHA, +1 à 2 autres  | Moyenne | 9 m     | Vision nocturne, immunité charme                    |
| Demi-Orc   | +2 FOR, +1 CON         | Moyenne | 9 m     | Vision nocturne, endurance implacable, critique sauvage |
| Drakéide   | +2 FOR, +1 CHA         | Moyenne | 9 m     | Souffle (dégâts élémentaires), résistance élémentaire |
| Gnome      | +2 INT                 | Petite  | 7,5 m   | Vision nocturne, ruse gnome (avantage sauvegardes mentales vs magie) |
| Tieffelin  | +2 CHA, +1 INT         | Moyenne | 9 m     | Vision nocturne, résistance feu, magie innée        |

### 5.2 Classes principales (SRD)

| Classe     | DV   | Carac. primaire | Sauv. maîtrisées | Rôle principal                        |
|------------|------|-----------------|------------------|---------------------------------------|
| Barbare    | d12  | FOR             | FOR, CON         | Combattant au corps à corps endurant  |
| Barde      | d8   | CHA             | DEX, CHA         | Support, polyvalent, lanceur          |
| Clerc      | d8   | SAG             | SAG, CHA         | Lanceur divin, soin                   |
| Druide     | d8   | SAG             | INT, SAG         | Lanceur nature, métamorphose          |
| Ensorceleur| d6   | CHA             | CON, CHA         | Lanceur spontané                      |
| Guerrier   | d10  | FOR ou DEX      | FOR, CON         | Combattant polyvalent                 |
| Magicien   | d6   | INT             | INT, SAG         | Lanceur arcanique érudit              |
| Moine      | d8   | DEX & SAG       | FOR, DEX         | Combattant agile sans armure          |
| Paladin    | d10  | FOR, CHA        | SAG, CHA         | Combattant sacré avec sorts           |
| Rôdeur     | d10  | DEX, SAG        | FOR, DEX         | Combattant nature, à distance         |
| Roublard   | d8   | DEX             | DEX, INT         | Spécialiste, attaque sournoise        |
| Sorcier    | d8   | CHA             | SAG, CHA         | Lanceur à pacte                       |

**Dé de vie (DV)** : détermine les PV gagnés à la montée de niveau.

### 5.3 Points de vie

- **Niveau 1** : max du DV + modificateur de CON.
- **Niveaux suivants** : 1 DV + mod. CON à chaque niveau (ou prendre la moyenne arrondie sup : ex. d8 = 5).

---

## 6. Classe d'Armure (CA)

La CA représente la difficulté à toucher un personnage.

### 6.1 Sans armure
```
CA = 10 + modificateur de DEX
```

### 6.2 Avec armure

| Type d'armure     | CA                             | Maîtrise requise | FOR min. | Discrétion    |
|-------------------|--------------------------------|------------------|----------|---------------|
| **Légère**        |                                |                  |          |               |
| Rembourrée        | 11 + mod. DEX                  | Légère           | —        | Désavantage   |
| Cuir              | 11 + mod. DEX                  | Légère           | —        | —             |
| Cuir clouté       | 12 + mod. DEX                  | Légère           | —        | —             |
| **Intermédiaire** |                                |                  |          |               |
| Peau              | 12 + mod. DEX (max +2)         | Intermédiaire    | —        | —             |
| Chemise de maille | 13 + mod. DEX (max +2)         | Intermédiaire    | —        | —             |
| Écailles          | 14 + mod. DEX (max +2)         | Intermédiaire    | —        | Désavantage   |
| Cuirasse          | 14 + mod. DEX (max +2)         | Intermédiaire    | —        | —             |
| Demi-plate        | 15 + mod. DEX (max +2)         | Intermédiaire    | —        | Désavantage   |
| **Lourde**        |                                |                  |          |               |
| Broigne           | 14                             | Lourde           | 13       | Désavantage   |
| Cotte de mailles  | 16                             | Lourde           | 13       | Désavantage   |
| Clibanion         | 17                             | Lourde           | 15       | Désavantage   |
| Harnois           | 18                             | Lourde           | 15       | Désavantage   |
| **Bouclier**      | +2 CA                          | Boucliers        | —        | —             |

---

## 7. Combat

### 7.1 Structure du combat

Un combat se déroule en **rounds** (≈ 6 secondes). Chaque round, chaque participant agit à son **tour**, dans l'ordre d'**initiative**.

### 7.2 Initiative

```
Initiative = 1d20 + modificateur de DEX
```

Tous les participants roulent. Ordre du plus haut au plus bas. En cas d'égalité : PNJ vs PJ → l'un a la priorité selon MJ ; entre PJ, discussion ou relance.

### 7.3 Anatomie d'un tour

À son tour, un personnage peut effectuer **dans n'importe quel ordre** :
- **1 action** (voir liste ci-dessous)
- **1 action bonus** (si une capacité le permet)
- **1 réaction** (par round, pas forcément à son tour)
- **Mouvement** jusqu'à sa vitesse (peut être scindé)
- **Interactions gratuites** (dégainer une arme, ouvrir une porte non verrouillée, parler brièvement)

### 7.4 Actions standard

| Action          | Effet                                                                 |
|-----------------|----------------------------------------------------------------------|
| Attaquer        | Une attaque (ou plus si la classe le permet) au contact ou à distance |
| Lancer un sort  | Durée d'incantation d'1 action                                        |
| Foncer          | Double la vitesse pour ce tour                                        |
| Se désengager   | Les mouvements ne provoquent pas d'attaques d'opportunité            |
| Esquiver        | Jusqu'au prochain tour : désavantage aux attaques contre vous, avantage aux sauv. DEX |
| Aider           | Donner l'avantage au prochain jet d'attaque/compétence d'un allié    |
| Se cacher       | Jet de Discrétion                                                    |
| Préparer        | Déclencher une action définie à un événement précis (consomme la réaction) |
| Chercher        | Jet de Perception ou Investigation                                   |
| Utiliser objet  | Utiliser un objet magique ou non                                     |

### 7.5 Jet d'attaque

```
Jet d'attaque = 1d20 + modif. de carac. + bonus de maîtrise
```

- Arme de corps à corps : FOR par défaut (ou DEX si arme de finesse).
- Arme à distance : DEX.
- Sort : carac. de lancement (INT, SAG ou CHA selon classe).

Touche si **≥ CA** de la cible.

### 7.6 Dégâts

```
Dégâts = dés d'arme/sort + modif. de carac. (attaques uniquement) + autres bonus
```

Sur un **critique** : doubler uniquement les dés de dégâts (pas les modificateurs).

### 7.7 Types de dégâts

Contondant, perforant, tranchant, acide, feu, froid, foudre, force, nécrotique, poison, psychique, radiant, tonnerre.

Une créature peut être :
- **Vulnérable** : dégâts × 2.
- **Résistante** : dégâts ÷ 2 (arrondi inf.).
- **Immunisée** : dégâts = 0.

### 7.8 Attaque d'opportunité

Une créature qui **sort du contact** d'un ennemi provoque une **attaque d'opportunité** (réaction). Évitable par action Se désengager, Téléportation, ou mouvement forcé.

### 7.9 Couverture

| Couverture   | Bonus CA & sauv. DEX | Exemple                           |
|--------------|----------------------|-----------------------------------|
| Partielle    | +2                   | Meuble, allié, muret bas          |
| Trois-quarts | +5                   | Meurtrière, tronc épais           |
| Totale       | Pas de cible         | Mur, cachette complète            |

### 7.10 Points de vie, 0 PV et mort

- PV à 0 et plus de dégâts que le maximum de PV → **mort instantanée**.
- PV à 0 sans dépassement → **inconscient**, jets de sauvegarde contre la mort.

**Jets de sauvegarde contre la mort** (au début de chaque tour à 0 PV) :
- Jet de `1d20` sans modificateur.
- **≥ 10** : succès ; **< 10** : échec ; **1 naturel** : 2 échecs ; **20 naturel** : reprend conscience à 1 PV.
- **3 succès** → stabilisé (inconscient mais plus en danger).
- **3 échecs** → mort.

**Stabilisation** : Médecine DD 10 ou sort guérisseur, même mineur.

### 7.11 Repos

- **Repos court** (1h) : dépenser des dés de vie pour récupérer des PV (`1 DV + mod. CON` par dé dépensé). Récupération de certaines capacités.
- **Repos long** (8h) : récupère tous les PV, la moitié des DV max, tous les emplacements de sorts.

---

## 8. Magie

### 8.1 Emplacements de sorts (spell slots)

Les lanceurs ont des emplacements par niveau (1 à 9). Lancer un sort consomme un emplacement du niveau du sort (ou supérieur). Les tours de magie (cantrips, niveau 0) ne consomment pas d'emplacement.

### 8.2 Table de progression pour lanceurs complets

| Niv. PJ | Sorts 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---------|---------|---|---|---|---|---|---|---|---|
| 1       | 2       | — | — | — | — | — | — | — | — |
| 2       | 3       | — | — | — | — | — | — | — | — |
| 3       | 4       | 2 | — | — | — | — | — | — | — |
| 4       | 4       | 3 | — | — | — | — | — | — | — |
| 5       | 4       | 3 | 2 | — | — | — | — | — | — |
| 6       | 4       | 3 | 3 | — | — | — | — | — | — |
| 7       | 4       | 3 | 3 | 1 | — | — | — | — | — |
| 8       | 4       | 3 | 3 | 2 | — | — | — | — | — |
| 9       | 4       | 3 | 3 | 3 | 1 | — | — | — | — |
| 10      | 4       | 3 | 3 | 3 | 2 | — | — | — | — |
| 11      | 4       | 3 | 3 | 3 | 2 | 1 | — | — | — |
| 12      | 4       | 3 | 3 | 3 | 2 | 1 | — | — | — |
| 13      | 4       | 3 | 3 | 3 | 2 | 1 | 1 | — | — |
| 14      | 4       | 3 | 3 | 3 | 2 | 1 | 1 | — | — |
| 15      | 4       | 3 | 3 | 3 | 2 | 1 | 1 | 1 | — |
| 16      | 4       | 3 | 3 | 3 | 2 | 1 | 1 | 1 | — |
| 17      | 4       | 3 | 3 | 3 | 2 | 1 | 1 | 1 | 1 |
| 18      | 4       | 3 | 3 | 3 | 3 | 1 | 1 | 1 | 1 |
| 19      | 4       | 3 | 3 | 3 | 3 | 2 | 1 | 1 | 1 |
| 20      | 4       | 3 | 3 | 3 | 3 | 2 | 2 | 1 | 1 |

Lanceurs concernés : Barde, Clerc, Druide, Ensorceleur, Magicien.
Lanceurs partiels (Paladin, Rôdeur) : progression moitié.
Sorcier : emplacements spéciaux (Mystic Arcanum, pact magic — à traiter à part).

### 8.3 DD de sauvegarde et bonus d'attaque de sort

```
DD de sauvegarde du sort = 8 + bonus de maîtrise + modif. de carac. de lancement
Bonus d'attaque de sort = bonus de maîtrise + modif. de carac. de lancement
```

Carac. de lancement :
- Barde, Ensorceleur, Paladin, Sorcier : CHA
- Clerc, Druide, Rôdeur : SAG
- Magicien : INT

### 8.4 Composantes d'un sort

- **V** (verbales) : paroles — rendent la discrétion impossible.
- **G** (gestuelles) : main libre nécessaire.
- **M** (matérielles) : composant spécifique (ou focaliseur).

### 8.5 Concentration

Certains sorts nécessitent de la concentration pour durer. Un personnage ne peut concentrer que sur **un seul sort à la fois**. Si un personnage concentré subit des dégâts :

```
Sauvegarde de CON, DD = max(10, dégâts reçus / 2)
```

Échec → concentration brisée, sort terminé. Aussi rompue par : lancer un autre sort à concentration, incapacité, mort.

### 8.6 Rituels

Certains sorts ont la mention "rituel". Ils peuvent être lancés sans emplacement, mais prennent **10 minutes de plus**.

### 8.7 Lancer à un niveau supérieur

Un sort lancé via un emplacement de niveau supérieur peut avoir des effets accrus (ex. : +1d6 de dégâts par niveau au-dessus du niveau de base).

---

## 9. États préjudiciables

| État         | Effet principal                                                                                    |
|--------------|----------------------------------------------------------------------------------------------------|
| À terre      | Désavantage aux attaques. Attaques au contact vs lui : avantage. À distance : désavantage. Mouvement coûte ½. |
| Agrippé      | Vitesse 0. Prend fin si l'agripper devient incapable.                                              |
| Aveuglé      | Échec auto aux jets nécessitant la vue. Désavantage aux attaques. Avantage des attaques contre lui.|
| Assourdi     | Échec auto aux jets nécessitant l'ouïe.                                                           |
| Charmé       | Ne peut attaquer le charmeur. Charmeur a avantage aux jets sociaux contre lui.                    |
| Empoigné     | (Voir Agrippé.)                                                                                    |
| Empoisonné   | Désavantage aux jets d'attaque et aux tests de caractéristique.                                   |
| Entravé      | Vitesse 0, désavantage aux attaques et aux jets DEX, attaquants ont avantage.                    |
| Étourdi      | Incapable. Échec auto aux sauv. FOR et DEX. Attaquants ont avantage.                              |
| Inconscient  | Incapable, à terre, échec auto sauv. FOR et DEX. Attaques contre : avantage. Corps à corps : critique auto. |
| Incapable    | Ne peut faire ni action ni réaction.                                                              |
| Invisible    | Attaquants ont désavantage. Attaques de l'invisible : avantage.                                   |
| Paralysé     | Incapable, vitesse 0, échec sauv. FOR et DEX. Avantage contre. Corps à corps : critique auto.    |
| Pétrifié     | Transformé en pierre, incapable, résistance à tous les dégâts, immunité poison/maladie.          |
| Effrayé      | Désavantage aux jets tant que la source est en vue. Ne peut s'approcher d'elle volontairement.    |
| Exhaustion   | Par niveau : voir table dédiée ci-dessous.                                                        |

### 9.1 Niveaux d'exhaustion

| Niveau | Effet cumulatif                            |
|--------|--------------------------------------------|
| 1      | Désavantage aux tests de caractéristique   |
| 2      | Vitesse divisée par deux                   |
| 3      | Désavantage aux jets d'attaque et sauv.    |
| 4      | PV max divisés par deux                    |
| 5      | Vitesse réduite à 0                        |
| 6      | Mort                                       |

Un repos long retire 1 niveau d'exhaustion (si nourri/abreuvé).

---

## 10. Expérience et progression

### 10.1 Table de niveaux (PJ)

| Niveau | XP requis  | Bonus maîtrise |
|--------|-----------:|:--------------:|
| 1      | 0          | +2             |
| 2      | 300        | +2             |
| 3      | 900        | +2             |
| 4      | 2 700      | +2             |
| 5      | 6 500      | +3             |
| 6      | 14 000     | +3             |
| 7      | 23 000     | +3             |
| 8      | 34 000     | +3             |
| 9      | 48 000     | +4             |
| 10     | 64 000     | +4             |
| 11     | 85 000     | +4             |
| 12     | 100 000    | +4             |
| 13     | 120 000    | +5             |
| 14     | 140 000    | +5             |
| 15     | 165 000    | +5             |
| 16     | 195 000    | +5             |
| 17     | 225 000    | +6             |
| 18     | 265 000    | +6             |
| 19     | 305 000    | +6             |
| 20     | 355 000    | +6             |

### 10.2 Amélioration de caractéristiques (ASI)

Aux niveaux **4, 8, 12, 16, 19** (et certains à 6 et 14 selon classe) : +2 à une carac., ou +1 à deux carac. différentes, ou don (feat) selon règles optionnelles. Plafond par défaut : 20.

### 10.3 XP de rencontre (par créature)

| FP (CR) | XP      | FP (CR) | XP      |
|---------|---------|---------|---------|
| 0       | 10      | 11      | 7 200   |
| 1/8     | 25      | 12      | 8 400   |
| 1/4     | 50      | 13      | 10 000  |
| 1/2     | 100     | 14      | 11 500  |
| 1       | 200     | 15      | 13 000  |
| 2       | 450     | 16      | 15 000  |
| 3       | 700     | 17      | 18 000  |
| 4       | 1 100   | 18      | 20 000  |
| 5       | 1 800   | 19      | 22 000  |
| 6       | 2 300   | 20      | 25 000  |
| 7       | 2 900   | 21      | 33 000  |
| 8       | 3 900   | 22      | 41 000  |
| 9       | 5 000   | 23      | 50 000  |
| 10      | 5 900   | 24+     | 62 000+ |

---

## 11. Équipement

### 11.1 Monnaie

| Pièce          | Abbr. | Équivalence           |
|----------------|-------|-----------------------|
| Pièce de cuivre| pc    | 1 pc                  |
| Pièce d'argent | pa    | 10 pc                 |
| Pièce d'électrum| pe   | 5 pa (50 pc)          |
| Pièce d'or     | po    | 10 pa (100 pc)        |
| Pièce de platine| pp   | 10 po (1 000 pc)      |

### 11.2 Exemples d'armes

| Arme             | Coût  | Dégâts      | Propriétés                                     |
|------------------|-------|-------------|------------------------------------------------|
| Dague            | 2 po  | 1d4 perf.   | Finesse, légère, lancer (6/18 m)               |
| Épée courte      | 10 po | 1d6 perf.   | Finesse, légère                                |
| Épée longue      | 15 po | 1d8 tranch. | Polyvalente (1d10)                             |
| Épée à 2 mains   | 50 po | 2d6 tranch. | À 2 mains, lourde                              |
| Rapière          | 25 po | 1d8 perf.   | Finesse                                        |
| Arc court        | 25 po | 1d6 perf.   | Munitions (24/96 m), à 2 mains                 |
| Arc long         | 50 po | 1d8 perf.   | Munitions (45/180 m), à 2 mains, lourde        |
| Arbalète légère  | 25 po | 1d8 perf.   | Munitions (24/96 m), chargement, à 2 mains     |
| Bâton            | 2 ac  | 1d6 cont.   | Polyvalent (1d8)                               |
| Masse d'armes    | 5 po  | 1d6 cont.   | —                                              |
| Marteau de guerre| 15 po | 1d8 cont.   | Polyvalent (1d10)                              |

### 11.3 Propriétés d'armes

- **Finesse** : utiliser FOR ou DEX au choix.
- **Légère** : attaque à 2 armes possible.
- **Lourde** : désavantage pour créatures Petites.
- **Portée** : 2 distances (normale/longue). Au-delà de normale : désavantage.
- **Polyvalente** : dégâts différents à 2 mains.
- **À 2 mains** : impose l'usage à 2 mains.
- **Chargement** : 1 seule attaque par round avec cette arme.
- **Munitions** : requiert des munitions ; récupérables à 50 %.
- **Lancer** : peut être lancée (même distance que portée).

---

## 12. Formules récapitulatives (pour implémentation)

```python
# Modificateur à partir d'une valeur de caractéristique
modifier = (score - 10) // 2

# Bonus de maîtrise selon niveau
proficiency_bonus = ceil(1 + level / 4)

# Classe d'armure (sans armure)
ac = 10 + dex_mod

# Jet d'attaque
attack_roll = d20() + ability_mod + (proficiency_bonus if proficient else 0)
hit = attack_roll >= target_ac

# Dégâts (non critique)
damage = sum(weapon_dice) + ability_mod + bonuses

# Dégâts critiques
damage_crit = sum(weapon_dice) + sum(weapon_dice_again) + ability_mod + bonuses

# DD de sauvegarde d'un sort
spell_save_dc = 8 + proficiency_bonus + casting_ability_mod

# Bonus d'attaque de sort
spell_attack = proficiency_bonus + casting_ability_mod

# Sauvegarde de concentration
concentration_dc = max(10, damage_taken // 2)

# Initiative
initiative = d20() + dex_mod

# PV niveau 1
hp_level_1 = hit_die_max + con_mod

# PV à un niveau supérieur (moyenne)
hp_level_up = (hit_die_avg) + con_mod  # ex. d8 -> 5

# Jet de sauvegarde contre la mort
# d20 : >=10 succès, <10 échec, 1 = 2 échecs, 20 = reprise à 1 PV
# 3 succès -> stabilisé, 3 échecs -> mort
```

---

## 13. Ordre de résolution d'un tour (pseudo-code)

```
function execute_turn(character):
    # Début du tour
    apply_start_of_turn_effects(character)        # poison, régén., sauv. contre effets
    if character.is_dying:
        death_saving_throw(character)
        return

    # Actions disponibles
    actions_available   = 1
    bonus_actions       = 1
    reaction_available  = (character.reaction_used == false)
    movement_remaining  = character.speed

    while character.wants_to_act and (actions_available > 0 or movement_remaining > 0 or bonus_actions > 0):
        choice = character.choose_action()

        if choice.is_movement:
            move(character, choice.distance)
            check_opportunity_attacks(character)
            movement_remaining -= choice.distance

        elif choice.is_action and actions_available > 0:
            resolve_action(choice)
            actions_available -= 1

        elif choice.is_bonus_action and bonus_actions > 0:
            resolve_action(choice)
            bonus_actions -= 1

        elif choice.is_free_interaction:
            resolve_interaction(choice)

    apply_end_of_turn_effects(character)
```

---

## 14. Notes de conception pour un jeu en ligne

Points d'attention pour une implémentation numérique :

- **Source de hasard** : toujours utiliser un RNG cryptographique côté serveur ; ne jamais faire confiance au client pour les jets.
- **Source de vérité** : l'état de combat (PV, positions, emplacements, concentration) doit vivre côté serveur.
- **Événements** : modéliser début de tour, fin de tour, avant/après attaque, sur dégâts, etc. pour y accrocher les capacités et effets (trigger system).
- **Concentration** : un seul sort de concentration par entité — gérer explicitement comme un champ unique remplaçable.
- **File d'initiative** : liste ordonnée, avec gestion des égalités et des créatures ajoutées/retirées en cours de combat.
- **États** (conditions) : système de flags avec durées (rounds, minutes, jusqu'à sauvegarde réussie…).
- **Modificateurs empilables vs non empilables** : avantage/désavantage ne s'empilent pas ; bonus de maîtrise ne se cumule pas avec lui-même.
- **Aires d'effet** : cônes, cubes, cylindres, lignes, sphères — prévoir une couche géométrique (grille ou continu).
- **Log structuré** : tracer chaque jet (dés bruts + modificateurs + résultat + DD/CA cible + issue) pour l'audit et le replay.
- **Données statiques vs dynamiques** : sorts, armes, monstres dans un format déclaratif (JSON/YAML) ; logique dans le code.

---

## 15. Sources et licence

Ce résumé s'appuie sur le **System Reference Document 5.1** publié par Wizards of the Coast sous **Creative Commons CC-BY-4.0**, ainsi que sur la **Open Game License 1.0a**. Pour une utilisation commerciale, vérifier les termes à jour sur https://dnd.wizards.com/resources/systems-reference-document et https://www.dndbeyond.com/srd.

Les noms "Dungeons & Dragons" et "D&D" sont des marques déposées de Wizards of the Coast ; ne pas les utiliser dans la marque du jeu sans accord.

---

*Fin du document. Pour des règles complètes (tous les sorts, monstres, classes détaillées, etc.), se référer au SRD 5.1 officiel.*
